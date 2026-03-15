#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash ./scripts/prepare-venv.sh

port_pids() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  fi
  if [[ -z "$pids" ]] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "${port}/tcp" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' || true)"
  fi
  printf '%s\n' "$pids" | sed '/^$/d' | sort -u
}

kill_port() {
  local port="$1"
  local pids
  pids="$(port_pids "$port")"
  if [[ -z "$pids" ]]; then
    echo "Port $port already free"
    return
  fi
  echo "Killing processes on port $port: $pids"
  printf '%s\n' "$pids" | xargs kill 2>/dev/null || true
  sleep 1
  pids="$(port_pids "$port")"
  if [[ -n "$pids" ]]; then
    echo "Force killing processes on port $port: $pids"
    printf '%s\n' "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  pids="$(port_pids "$port")"
  if [[ -n "$pids" ]]; then
    echo "Port $port is still in use by: $pids"
    exit 1
  fi
}

for port in 8000 8001 5173; do
  kill_port "$port"
done

python3 scripts/dev_up.py all "$@"
