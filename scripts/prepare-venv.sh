#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

if [[ "${HOUSTON_DISABLE_SYSTEM_SITE_PACKAGES:-0}" == "1" ]]; then
  exit 0
fi

if [[ "$(uname -s)" != "Linux" ]] || ! command -v uv >/dev/null 2>&1; then
  exit 0
fi

cfg="$VENV_DIR/pyvenv.cfg"
if [[ -f "$cfg" ]] && grep -qi '^include-system-site-packages *= *true' "$cfg"; then
  exit 0
fi

echo "Preparing .venv with system site packages"
rm -rf "$VENV_DIR"
uv venv --system-site-packages "$VENV_DIR"
