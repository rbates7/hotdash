#!/usr/bin/env bash
# Login gate (#64) review stills from PRODUCTION builds, Next portal visible:
# before = develop (no gate), after = the head with THROWAWAY gate values only
# (an @example.invalid email and a TEST-ONLY- password; scripts/shot-env.mjs
# refuses anything else). Also runs the opt-in gate e2e against the after
# server. Servers start with `env -i` and the allow-list (scripts/shot-server.sh).
# Needs the team's build/Playwright slot. Shots stay on this box: never push them.
#
#   scripts/gate-reshoot.sh <head-ref> [base-ref] [out-root]
#   defaults:  (required)  origin/develop  /workspace/hotdash-shots/dashboard-gate-64
#
#   SHOT_ONLY=lockout scripts/gate-reshoot.sh <head-ref>
#     one production build (the head, throwaway values) and only the
#     "Too many tries" stills at 390 and 1440, light and dark, into
#     <out-root>/<head>-lockout/after; no before set, no gate e2e.
set -euo pipefail
# shellcheck source=scripts/shot-server.sh
source "$(dirname "${BASH_SOURCE[0]}")/shot-server.sh"
GATE_EMAIL=gate-shots@example.invalid
GATE_PASSWORD=TEST-ONLY-gate-shots-64
if [ "${1:-}" = --print-server-env ]; then shot_print_server_env "${2:-3000}"; exit 0; fi

HEAD_REF=${1:?usage: scripts/gate-reshoot.sh <head-ref> [base-ref] [out-root]}
BASE_REF=${2:-origin/develop}
OUT_ROOT=${3:-/workspace/hotdash-shots/dashboard-gate-64}
PORT_BASE=${PORT_BASE:-3231}
PORT_HEAD=${PORT_HEAD:-3232}
REPO=$(git rev-parse --show-toplevel)
git() { env -u GITHUB_TOKEN -u GH_TOKEN "$(type -P git)" "$@"; }

avail=$(free -g | awk '/^Mem:/ {print $7}')
if [ "${avail:-0}" -lt 4 ]; then echo "only ${avail} GB available (< 4): wait and retry" >&2; exit 1; fi

git -C "$REPO" fetch origin
HEAD_SHA=$(git -C "$REPO" rev-parse "$HEAD_REF")
BASE_SHA=$(git -C "$REPO" rev-parse "$BASE_REF")
SHOT_ONLY=${SHOT_ONLY:-}
if [ "$SHOT_ONLY" = lockout ]; then OUT="$OUT_ROOT/${HEAD_SHA:0:7}-lockout"; else OUT="$OUT_ROOT/${HEAD_SHA:0:7}-vs-develop-${BASE_SHA:0:7}"; fi
mkdir -p "$OUT/before" "$OUT/after"
WT_HEAD=/tmp/gateshots-head-${HEAD_SHA:0:7}
WT_BASE=/tmp/gateshots-base-${BASE_SHA:0:7}
SERVER_PID=
SERVER_ENV=

stop_server() {
  kill -TERM -- "-$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=
}
cleanup() {
  [ -n "$SERVER_PID" ] && stop_server
  git -C "$REPO" worktree remove --force "$WT_HEAD" 2>/dev/null || true
  git -C "$REPO" worktree remove --force "$WT_BASE" 2>/dev/null || true
  [ -n "$SERVER_ENV" ] && rm -f "$SERVER_ENV"
  return 0
}
trap cleanup EXIT

git -C "$REPO" worktree add --detach "$WT_HEAD" "$HEAD_SHA"
git -C "$REPO" worktree add --detach "$WT_BASE" "$BASE_SHA"
(cd "$WT_HEAD" && pnpm install --frozen-lockfile --prefer-offline)

serve() { # dir port [NAME=VALUE…]: production build, then start in the background
  local dir=$1 port=$2
  shift 2
  [ -n "$SERVER_ENV" ] && rm -f "$SERVER_ENV"
  SERVER_ENV=$(mktemp /tmp/shot-server-env.XXXXXX)
  node "$SHOT_LIB_DIR/shot-env-cli.mjs" env "PORT=$port" "$@" | tr '\0' '\n' > "$SERVER_ENV"
  node "$SHOT_LIB_DIR/shot-env-cli.mjs" check "$SERVER_ENV"
  (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline)
  shot_run "$dir" "$port" "$SERVER_ENV" -- pnpm build
  setsid bash -c 'source "$0"; shot_run "$1" "$2" "$3" -- pnpm start --port "$2"' \
    "$SHOT_LIB_DIR/shot-server.sh" "$dir" "$port" "$SERVER_ENV" &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$port/icon.svg" && return 0; sleep 2; done
  echo "server on $port never came up" >&2; exit 1
}

shoot() { # phase port served-sha
  (cd "$WT_HEAD" && SHOT_ONLY="$SHOT_ONLY" PORT="$2" SHOT_SERVER_ENV_FILE="$SERVER_ENV" SCREENSHOTS=1 SHOT_PHASE="$1" SCREENSHOT_DIR="$OUT/$1" \
    SHOT_SERVER_SHA="$3" pnpm exec playwright test e2e/dashboard-gate-shots.spec.ts --workers=1)
}

if [ "$SHOT_ONLY" = lockout ]; then
  rmdir "$OUT/before" 2>/dev/null || true
  serve "$WT_HEAD" "$PORT_HEAD" "DASHBOARD_LOGIN_EMAIL=$GATE_EMAIL" "DASHBOARD_GATE_SECRET=$GATE_PASSWORD"
  shoot after "$PORT_HEAD" "$HEAD_SHA"
  stop_server
  printf 'head %s\nlockout stills only (error=limited), 390 and 1440, light and dark\nproduction build (next build && next start), nextjs-portal not hidden\ngate values: throwaway test values only\n' \
    "$HEAD_SHA" > "$OUT/SHAS.txt"
  ls "$OUT/after" | grep -c png
  echo "shots in $OUT"
  exit 0
fi

serve "$WT_BASE" "$PORT_BASE"; shoot before "$PORT_BASE" "$BASE_SHA"; stop_server
serve "$WT_HEAD" "$PORT_HEAD" "DASHBOARD_LOGIN_EMAIL=$GATE_EMAIL" "DASHBOARD_GATE_SECRET=$GATE_PASSWORD"
shoot after "$PORT_HEAD" "$HEAD_SHA"
stop_server
# Fresh process (same build, same throwaway values) so the per-instance
# wrong-login counts from the stills start at zero.
setsid bash -c 'source "$0"; shot_run "$1" "$2" "$3" -- pnpm start --port "$2"' \
  "$SHOT_LIB_DIR/shot-server.sh" "$WT_HEAD" "$PORT_HEAD" "$SERVER_ENV" &
SERVER_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT_HEAD/icon.svg" && break; sleep 2; done
# The opt-in gate e2e, same server, same throwaway values.
(cd "$WT_HEAD" && PORT="$PORT_HEAD" GATE_E2E=1 GATE_E2E_EMAIL="$GATE_EMAIL" GATE_E2E_PASSWORD="$GATE_PASSWORD" \
  pnpm exec playwright test e2e/dashboard-gate.spec.ts --workers=1 --fail-on-flaky-tests)
stop_server

printf 'head %s\nbase (develop) %s\nproduction builds (next build && next start), nextjs-portal not hidden\n' \
  "$HEAD_SHA" "$BASE_SHA" > "$OUT/SHAS.txt"
ls "$OUT/before" "$OUT/after" | grep -c png
echo "shots in $OUT"
