#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash ./scripts/prepare-venv.sh
python3 scripts/dev_up.py edge "$@"
