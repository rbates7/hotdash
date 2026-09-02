#!/usr/bin/env bash
# Pull, rebuild, and (re)start the CRM in the background.
#
#   pnpm crm:restart     pull + build + start, then give the terminal back
#   pnpm crm:stop        stop the running server
#   pnpm crm:logs        follow the server log
#
# The server used to hold whatever terminal started it, so every later
# command landed in that window as inert text while the old process kept
# running. Detaching it means one terminal, one command, and the prompt
# comes back.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
LOG="data/server.log"
PIDFILE="data/server.pid"
mkdir -p data

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

git pull --ff-only

# Stop whatever we started last time (by pid file), then anything else
# holding the port. The pid file is the precise answer; lsof is the backstop.
if [ -f "${PIDFILE}" ] && kill -0 "$(cat "${PIDFILE}")" 2>/dev/null; then
  echo "Stopping the previous server (pid $(cat "${PIDFILE}"))..."
  kill_tree "$(cat "${PIDFILE}")"
  sleep 2
fi
if pids=$(lsof -ti tcp:"${PORT}" 2>/dev/null) && [ -n "${pids}" ]; then
  echo "Stopping the server on port ${PORT}..."
  kill ${pids} 2>/dev/null || true
  sleep 2
fi
rm -f "${PIDFILE}"

# A build can carry a database migration, and some of those rebuild a table.
# Keep last night's database alongside, so going back is one copy.
pnpm crm:backup

rm -rf .next
pnpm build

: > "${LOG}"
nohup pnpm start >> "${LOG}" 2>&1 < /dev/null &
echo $! > "${PIDFILE}"
disown

# Wait for it to answer rather than declaring victory on a launch.
for _ in $(seq 1 30); do
  if grep -q "Ready in" "${LOG}" 2>/dev/null; then
    echo
    echo "CRM is running at http://localhost:${PORT}/crm"
    echo "Logs: pnpm crm:logs   Stop: pnpm crm:stop"
    exit 0
  fi
  if grep -q "EADDRINUSE\|Failed to start" "${LOG}" 2>/dev/null; then
    echo
    echo "The server did not start:"
    tail -n 20 "${LOG}"
    exit 1
  fi
  sleep 1
done

echo
echo "Still starting after 30s. Check: pnpm crm:logs"
exit 1
