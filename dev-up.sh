#!/usr/bin/env bash
# Start the local preview detached (survives the Claude session). Idempotent.
# Usage: ./dev-up.sh [port] [dir]   — defaults: 8140, this repo
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
port="${1:-8140}"
dir="${2:-$here}"
log="/tmp/caninec-${port}.log"

if curl -s -o /dev/null "http://127.0.0.1:${port}/"; then
  echo "already running: http://localhost:${port}/"
  exit 0
fi

nohup python3 "$here/dev_server.py" "$port" "$dir" >"$log" 2>&1 </dev/null &
disown
sleep 0.5
curl -s -o /dev/null "http://127.0.0.1:${port}/" && echo "up: http://localhost:${port}/ (log $log)" || { echo "failed, see $log"; exit 1; }
