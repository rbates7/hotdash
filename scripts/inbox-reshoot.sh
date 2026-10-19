#!/usr/bin/env bash
# Re-shoot the Inbox review stills (Home's Needs-you door and the Workplace
# Inbox tab) from PRODUCTION builds of a head and of develop, Next.js portal
# left visible, into a folder named by both SHAs, with SHAS.txt at the top
# and beside each set (the specs write their own). Same shape as
# scripts/mrr-cash-reshoot.sh. Needs the team's build/Playwright slot: two
# `next build`s (one at a time) plus the shots. Nothing reaches GitHub or
# Sentry: servers start with `env -i` and an allow-list (scripts/shot-server.sh),
# Playwright refuses a server whose env holds a token, and the after spec
# mocks /api/inbox. Shots stay on this box: never push them anywhere.
#
#   scripts/inbox-reshoot.sh <head-ref> [base-ref] [out-root]
#   defaults:  (required)  origin/develop  /workspace/hotdash-shots/inbox
set -euo pipefail
# shellcheck source=scripts/shot-server.sh
source "$(dirname "${BASH_SOURCE[0]}")/shot-server.sh"
# Dry run: print the environment a server would get, then stop (no fetch, no build).
if [ "${1:-}" = --print-server-env ]; then shot_print_server_env "${2:-3000}"; exit 0; fi

HEAD_REF=${1:?usage: scripts/inbox-reshoot.sh <head-ref> [base-ref] [out-root]}
BASE_REF=${2:-origin/develop}
OUT_ROOT=${3:-/workspace/hotdash-shots/inbox}
PORT_BASE=${PORT_BASE:-3211}
PORT_HEAD=${PORT_HEAD:-3212}
REPO=$(git rev-parse --show-toplevel)
git() { env -u GITHUB_TOKEN -u GH_TOKEN "$(type -P git)" "$@"; }

avail=$(free -g | awk '/^Mem:/ {print $7}')
if [ "${avail:-0}" -lt 4 ]; then echo "only ${avail} GB available (< 4): wait and retry" >&2; exit 1; fi

git -C "$REPO" fetch origin
HEAD_SHA=$(git -C "$REPO" rev-parse "$HEAD_REF")
BASE_SHA=$(git -C "$REPO" rev-parse "$BASE_REF")
OUT="$OUT_ROOT/${HEAD_SHA:0:7}-vs-develop-${BASE_SHA:0:7}"
mkdir -p "$OUT/before" "$OUT/after"
WT_HEAD=/tmp/inboxshots-head-${HEAD_SHA:0:7}
WT_BASE=/tmp/inboxshots-base-${BASE_SHA:0:7}
SERVER_PID=
SERVER_ENV=

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
# The spec (and Playwright) always come from the head worktree.
(cd "$WT_HEAD" && pnpm install --frozen-lockfile --prefer-offline)

stop_server() { # the server runs in its own session: stop pnpm *and* next
  kill -TERM -- "-$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=
}

serve() { # dir port: production build, then start in the background
  [ -n "$SERVER_ENV" ] && rm -f "$SERVER_ENV"
  SERVER_ENV=$(mktemp /tmp/shot-server-env.XXXXXX)
  shot_env_file "$2" "$SERVER_ENV"
  (cd "$1" && pnpm install --frozen-lockfile --prefer-offline)
  shot_run "$1" "$2" "$SERVER_ENV" -- pnpm build
  setsid bash -c 'source "$0"; shot_run "$1" "$2" "$3" -- pnpm start --port "$2"' \
    "$SHOT_LIB_DIR/shot-server.sh" "$1" "$2" "$SERVER_ENV" &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$2/metrics" >/dev/null && return 0; sleep 2; done
  echo "server on $2 never came up" >&2; exit 1
}

shoot() { # tag port served-sha spec: from the HEAD worktree's spec, against the running server
  # No CI=true: Playwright then reuses the production server on the port.
  (cd "$WT_HEAD" && PORT="$2" SHOT_SERVER_ENV_FILE="$SERVER_ENV" SCREENSHOTS=1 SCREENSHOT_DIR="$OUT/$1" SHOT_SERVER_SHA="$3" SHOT_BASE_SHA="$BASE_SHA" \
    pnpm exec playwright test "$4" --workers=1)
}

serve "$WT_BASE" "$PORT_BASE"; shoot before "$PORT_BASE" "$BASE_SHA" e2e/inbox-before-shots.spec.ts; stop_server
serve "$WT_HEAD" "$PORT_HEAD"; shoot after "$PORT_HEAD" "$HEAD_SHA" e2e/inbox-screens.spec.ts; stop_server

printf 'head %s\nbase (develop) %s\nproduction builds (next build && next start), nextjs-portal not hidden\n' \
  "$HEAD_SHA" "$BASE_SHA" > "$OUT/SHAS.txt"
ls "$OUT/before" "$OUT/after" | wc -l
echo "shots in $OUT"
