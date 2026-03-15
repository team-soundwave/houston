#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for port in 8000 8001 5173; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Killing processes on port $port: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
    stubborn="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [[ -n "$stubborn" ]]; then
      echo "Force killing processes on port $port: $stubborn"
      kill -9 $stubborn 2>/dev/null || true
    fi
  fi
done

python3 scripts/dev_up.py all "$@"
