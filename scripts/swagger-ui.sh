#!/usr/bin/env bash
#
# Serves the running app's OpenAPI document in a local Swagger UI container,
# with the API reachable through the same origin as the UI.
#
#   bash scripts/swagger-ui.sh
#   APP_URL=http://localhost:4000 UI_PORT=9000 bash scripts/swagger-ui.sh
#
# Why the reverse proxy rather than pointing the UI straight at the app:
# main.ts enables no CORS, so a browser that loaded the UI from the UI's port
# is refused when it calls the app's port. Serving both from one origin
# removes the cross-origin call instead of asking the product to allow it.
# The generated document also carries no `servers` entry, so Swagger UI would
# otherwise resolve every path against its own port; the copy mounted here is
# rewritten to `servers: [{url: "/"}]`, which the proxy then routes.
#
# The spec is a snapshot taken at startup. Restart this script after changing
# a route or a schema.

set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
UI_PORT="${UI_PORT:-8080}"
IMAGE="swaggerapi/swagger-ui"

# Route groups the app owns, allow-listed rather than proxying everything that
# is not a UI asset: an unlisted path stays with the UI and fails visibly,
# instead of being silently forwarded once a new route appears.
API_LOCATIONS=(/auth/ /products /health /.well-known/)

work_dir="$(mktemp -d -t stockroom-swagger-XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 not found on PATH" >&2
    exit 1
  fi
}

fetch_spec() {
  if ! curl -fsS "$APP_URL/openapi.json" -o "$work_dir/raw.json"; then
    echo "cannot reach $APP_URL/openapi.json" >&2
    echo "start the app first: npm run start:dev" >&2
    exit 1
  fi
}

# Point every operation at the proxy's own origin.
rewrite_servers() {
  python3 - "$work_dir/raw.json" "$work_dir/openapi.json" <<'PY'
import json
import sys

source, target = sys.argv[1], sys.argv[2]
with open(source, encoding="utf-8") as handle:
    document = json.load(handle)
document["servers"] = [{"url": "/"}]
with open(target, "w", encoding="utf-8") as handle:
    json.dump(document, handle)
PY
  # mktemp -d yields a 0700 directory and nginx inside the image runs as
  # another uid, so without this the mounted spec answers 403 and the UI
  # loads empty.
  chmod 755 "$work_dir"
  chmod 644 "$work_dir/openapi.json"
}

# The app runs on the host, which the container reaches through the gateway
# alias added by --add-host below.
upstream_url() {
  local port
  port="${APP_URL##*:}"
  case "$port" in
    ''|*[!0-9]*) port=80 ;;
  esac
  echo "http://host.docker.internal:$port"
}

# Mirrors the image's own template (it envsubsts $PORT and $BASE_URL) and adds
# the proxy locations. The stock CORS and embedding includes are dropped: with
# one origin there is no cross-origin request left to permit.
write_nginx_template() {
  local upstream proxy_blocks=''
  upstream="$(upstream_url)"
  for location in "${API_LOCATIONS[@]}"; do
    proxy_blocks+="    location ${location} { proxy_pass ${upstream}; }"$'\n'
  done

  cat > "$work_dir/default.conf.template" <<TEMPLATE
  types {
    text/plain yaml;
    text/plain yml;
  }

  gzip on;
  gzip_static on;
  gzip_vary on;
  gzip_types text/plain text/css application/javascript;

  server_tokens off;

  server {
    listen            \$PORT;
    server_name       localhost;
    index             index.html index.htm;

${proxy_blocks}
    location \$BASE_URL {
      absolute_redirect off;
      alias            /usr/share/nginx/html/;
      expires 1d;

      location ~ swagger-initializer.js {
        expires -1;
      }

      location ~* \.(?:json|yml|yaml)\$ {
        expires -1;
      }
    }
  }
TEMPLATE
  chmod 644 "$work_dir/default.conf.template"
}

serve() {
  echo "spec fetched from $APP_URL/openapi.json"
  echo "API proxied from http://localhost:$UI_PORT to $APP_URL"
  echo "Swagger UI on http://localhost:$UI_PORT — ctrl-c to stop"
  docker run --rm \
    -p "$UI_PORT:8080" \
    --add-host "host.docker.internal:host-gateway" \
    -e SWAGGER_JSON=/spec/openapi.json \
    -v "$work_dir/openapi.json:/spec/openapi.json:ro" \
    -v "$work_dir/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
    "$IMAGE"
}

require docker
require curl
require python3
fetch_spec
rewrite_servers
write_nginx_template
serve
