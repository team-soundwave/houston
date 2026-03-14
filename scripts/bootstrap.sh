#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-all}"
REPO_URL="${HOUSTON_REPO_URL:-https://github.com/team-soundwave/houston.git}"
TARGET_DIR="${HOUSTON_TARGET_DIR:-$HOME/houston}"

if [[ -f "scripts/dev_up.py" ]]; then
  ROOT_DIR="$(pwd)"
else
  ROOT_DIR="$TARGET_DIR"
  if [[ -d "$ROOT_DIR/.git" ]]; then
    git -C "$ROOT_DIR" pull --ff-only
  elif [[ -d "$ROOT_DIR" ]]; then
    echo "Target directory exists but is not a git checkout: $ROOT_DIR" >&2
    exit 1
  else
    git clone "$REPO_URL" "$ROOT_DIR"
  fi
fi

cd "$ROOT_DIR"

case "$MODE" in
  all|edge|ground)
    python3 scripts/dev_up.py "$MODE"
    ;;
  *)
    echo "Usage: bash scripts/bootstrap.sh [all|edge|ground]" >&2
    exit 1
    ;;
esac
