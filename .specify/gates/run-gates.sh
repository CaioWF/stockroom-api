#!/usr/bin/env bash
set -uo pipefail
DIR="${1:-$PWD}"; cd "$DIR"
FAILED=0; RAN=0

run_check() { # name command...
  local name="$1"; shift
  echo "[keel:gates] running $name"
  RAN=$((RAN+1))
  "$@" || { echo "[keel:gates] $name FAILED"; FAILED=$((FAILED+1)); }
}

has_npm_script() { # name
  [ -f package.json ] || return 1
  node "$(dirname "$0")/has-npm-script.mjs" "$1"
}
has_make_target() { # name
  [ -f Makefile ] || return 1
  grep -qE "^$1:" Makefile
}

# Stack-independent build gate. Runs the FIRST build command that matches the
# detected stack, so "does it compile/build?" is verified before commit
# regardless of language. A project with no build step (interpreted, no compile)
# matches nothing and is correctly a no-op — there is nothing to build.
build_step() {
  if [ -f package.json ] && has_npm_script build; then run_check "build:npm" npm run build; return 0; fi
  if has_make_target build; then run_check "build:make" make build; return 0; fi
  if [ -f go.mod ]; then run_check "build:go" go build ./...; return 0; fi
  if [ -f Cargo.toml ]; then run_check "build:cargo" cargo build --quiet; return 0; fi
  if [ -f pom.xml ]; then run_check "build:maven" mvn -q -DskipTests package; return 0; fi
  if [ -f build.gradle ] || [ -f build.gradle.kts ]; then run_check "build:gradle" ./gradlew build -x test; return 0; fi
  if ls ./*.sln ./*.csproj >/dev/null 2>&1; then run_check "build:dotnet" dotnet build --nologo; return 0; fi
  return 1
}

# Doc-layer conformance gates (zero-dep node, run on every project — node is assumed
# available since bootstrap requires it). Auto-skip when their inputs are absent.
GATES_DIR="$(cd "$(dirname "$0")" && pwd)"
for g in audit-structure eval-spec-fidelity validate-mermaid; do
  [ -f "$GATES_DIR/$g.mjs" ] && run_check "doc:$g" node "$GATES_DIR/$g.mjs" "$DIR"
done
[ -f "$GATES_DIR/okf-build-index.mjs" ] && run_check "doc:okf-index" node "$GATES_DIR/okf-build-index.mjs" check "$DIR/docs"

# Pack-contributed gates. A pack drops a .mjs here instead of editing this file, which
# bootstrap rewrites on every --force — the same reason review-lenses.txt and
# impl-conventions.txt are living registries rather than edits to core files. copy_tree
# never deletes, so whatever a pack leaves in pack.d/ survives an update.
if [ -d "$GATES_DIR/pack.d" ]; then
  for g in "$GATES_DIR"/pack.d/*.mjs; do
    [ -e "$g" ] || continue
    run_check "pack:$(basename "$g" .mjs)" node "$g" "$DIR"
  done
fi

if [ -f package.json ]; then
  for s in lint test; do has_npm_script "$s" && run_check "npm:$s" npm run "$s"; done
elif [ -f Makefile ]; then
  for t in lint test; do has_make_target "$t" && run_check "make:$t" make "$t"; done
fi

# Build runs after lint/test, stack-detected and independent of the block above
# (a project may build via Go/Cargo/etc. while linting via make).
build_step || true

if [ "$RAN" -eq 0 ]; then echo "[keel:gates] no checks detected"; exit 0; fi
if [ "$FAILED" -ne 0 ]; then echo "[keel:gates] $FAILED gate(s) failed"; exit 1; fi
echo "[keel:gates] all gates passed"; exit 0
