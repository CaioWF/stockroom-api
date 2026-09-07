#!/usr/bin/env bash
set -euo pipefail

IMAGE="hashicorp/terraform:1.11.4"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$REPO_ROOT/terraform"
VARS_FILE="${1:-terraform/fixtures/check.tfvars}"
WORK_DIR="$(mktemp -d -t stockroom-infra-check-XXXXXX)"
# Outside WORK_DIR on purpose: cleanup deletes WORK_DIR, and a cache deleted
# every run is not a cache (FR24). The AWS provider is large; downloaded once.
PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/stockroom-terraform-plugins}"

cleanup() {
  rm -f "$TF_DIR/backend_override.tf"
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 not found on PATH" >&2
    exit 1
  fi
}

write_backend_override() {
  cat > "$TF_DIR/backend_override.tf" <<'HCL'
terraform {
  backend "local" {}
}
HCL
}

terraform_run() {
  docker run --rm \
    -u "$(id -u):$(id -g)" \
    -e HOME=/tmp/home \
    -e TF_DATA_DIR=/tmp/terraform-data \
    -e TF_PLUGIN_CACHE_DIR=/tmp/terraform-plugin-cache \
    -e AWS_ACCESS_KEY_ID=placeholder \
    -e AWS_SECRET_ACCESS_KEY=placeholder \
    -v "$REPO_ROOT:/workspace" \
    -v "$WORK_DIR:/tmp" \
    -v "$PLUGIN_CACHE_DIR:/tmp/terraform-plugin-cache" \
    -w /workspace/terraform \
    "$IMAGE" "$@"
}

require docker
mkdir -p "$WORK_DIR/home" "$PLUGIN_CACHE_DIR"
if [ -f "$REPO_ROOT/$VARS_FILE" ]; then
  RESOLVED_VARS_FILE="$REPO_ROOT/$VARS_FILE"
elif [ -f "$VARS_FILE" ]; then
  RESOLVED_VARS_FILE="$VARS_FILE"
else
  echo "variables file not found: $VARS_FILE (looked in $REPO_ROOT and the current directory)" >&2
  exit 1
fi
cp "$RESOLVED_VARS_FILE" "$WORK_DIR/check.tfvars"
# The function declares no source_code_hash, so plan never reads the artifact —
# but lambda_package_path has no default and must resolve to something. A byte
# of filler is enough, and keeps the check independent of a completed build.
printf 'placeholder lambda package for terraform plan\n' > "$WORK_DIR/lambda.zip"
write_backend_override

terraform_run fmt -check -recursive
# Initializes the transient local backend from backend_override.tf rather than
# skipping backend init: a declared-but-uninitialized backend makes `plan` fail
# with "Backend initialization required". State lands in the throwaway
# container temp dir, so the S3 backend is never contacted (FR23a).
terraform_run init -input=false -reconfigure -backend-config=path=/tmp/terraform.tfstate
terraform_run validate
terraform_run plan -input=false -refresh=false \
  -var-file=/tmp/check.tfvars \
  -var="lambda_package_path=/tmp/lambda.zip"
