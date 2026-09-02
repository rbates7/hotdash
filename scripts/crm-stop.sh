#!/usr/bin/env bash
# Stop the CRM server started by crm:restart.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
PIDFILE="data/server.pid"
stopped=0

# Kill a process and everything under it. `pnpm start` is a wrapper around
# `next start`, which is a wrapper around the actual server; killing only the
# pid we recorded leaves the real server alive and still answering.
kill_tree() {
  local pid="$1"
  for child in $(pgrep -P "${pid}" 2>/dev/null); do
    kill_tree "${child}"
  done
  kill "${pid}" 2>/dev/null || true
}

if [ -f "${PIDFILE}" ]; then
  pid=$(cat "${PIDFILE}")
  if kill -0 "${pid}" 2>/dev/null; then
    kill_tree "${pid}"
    stopped=1
  fi
  rm -f "${PIDFILE}"
fi

if pids=$(lsof -ti tcp:"${PORT}" 2>/dev/null) && [ -n "${pids}" ]; then
  kill ${pids} 2>/dev/null || true
  stopped=1
fi

if [ "${stopped}" = 1 ]; then
  echo "CRM stopped."
else
  echo "Nothing running on port ${PORT}."
fi
