#!/usr/bin/env bash
# Re-shoot #53's review stills from PRODUCTION builds of the PR head and of
# develop, with the Next.js dev portal left visible (the spec asserts it is
# absent, which only a production build satisfies), into a folder named by
# both SHAs. Needs the team's build/Playwright slot: it runs two `next build`s
# (one at a time) and 64 Playwright shots. Nothing reaches Stripe: the
# servers start with every key blank and the spec mocks the live states.
#
#   scripts/mrr-cash-reshoot.sh [head-ref] [base-ref] [out-root]
#   defaults: origin/feat/stripe-mrr-cash  origin/develop  /workspace/hotdash-shots/stripe-mrr-cash-53
set -euo pipefail

HEAD_REF=${1:-origin/feat/stripe-mrr-cash}
BASE_REF=${2:-origin/develop}
OUT_ROOT=${3:-/workspace/hotdash-shots/stripe-mrr-cash-53}
PORT_BASE=${PORT_BASE:-3201}
PORT_HEAD=${PORT_HEAD:-3202}
REPO=$(git rev-parse --show-toplevel)
git() { env -u GITHUB_TOKEN -u GH_TOKEN command git "$@"; }

avail=$(free -g | awk '/^Mem:/ {print $7}')
if [ "${avail:-0}" -lt 4 ]; then echo "only ${avail} GB available (< 4): wait and retry" >&2; exit 1; fi

git -C "$REPO" fetch origin
HEAD_SHA=$(git -C "$REPO" rev-parse "$HEAD_REF")
BASE_SHA=$(git -C "$REPO" rev-parse "$BASE_REF")
OUT="$OUT_ROOT/${HEAD_SHA:0:7}-vs-develop-${BASE_SHA:0:7}"
mkdir -p "$OUT/before" "$OUT/after"
WT_HEAD=/tmp/mrrcash-head-${HEAD_SHA:0:7}
WT_BASE=/tmp/mrrcash-base-${BASE_SHA:0:7}
SERVER_PID=

blank_keys=(STRIPE_READONLY_KEY= STRIPE_API_BASE= SUPABASE_READONLY_DB_URL= POSTHOG_READONLY_KEY= POSTHOG_HOST=
  GITHUB_READONLY_TOKEN= github_read_only= GMAIL_CLIENT_ID= GMAIL_CLIENT_SECRET= GMAIL_REFRESH_TOKEN= GMAIL_MAILBOX=)

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  git -C "$REPO" worktree remove --force "$WT_HEAD" 2>/dev/null || true
  git -C "$REPO" worktree remove --force "$WT_BASE" 2>/dev/null || true
}
trap cleanup EXIT

git -C "$REPO" worktree add --detach "$WT_HEAD" "$HEAD_SHA"
git -C "$REPO" worktree add --detach "$WT_BASE" "$BASE_SHA"
# The spec (and Playwright) always come from the head worktree.
(cd "$WT_HEAD" && pnpm install --frozen-lockfile --prefer-offline)

serve() { # dir port: production build, then start in the background
  (cd "$1" && pnpm install --frozen-lockfile --prefer-offline && env "${blank_keys[@]}" pnpm build)
  (cd "$1" && env "${blank_keys[@]}" pnpm start --port "$2") &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$2/metrics" >/dev/null && return 0; sleep 2; done
  echo "server on $2 never came up" >&2; exit 1
}

shoot() { # tag port: every state, from the HEAD worktree's spec, against the running server
  for state in not-connected connecting connected stale; do
    # No CI=true here: CI would make Playwright start its own server; without
    # it, it reuses the production server already listening on the port.
    (cd "$WT_HEAD" && PORT="$2" SCREENSHOTS=1 SCREENSHOT_TAG="$1" STATE="$state" SCREENSHOT_DIR="$OUT/$1" \
      pnpm exec playwright test e2e/mrr-cash-screens.spec.ts --workers=1)
  done
}

serve "$WT_BASE" "$PORT_BASE"; shoot before "$PORT_BASE"; kill "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null || true; SERVER_PID=
serve "$WT_HEAD" "$PORT_HEAD"; shoot after "$PORT_HEAD"; kill "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null || true; SERVER_PID=

printf 'head %s\nbase (develop) %s\nproduction builds (next build && next start), nextjs-portal not hidden\n' \
  "$HEAD_SHA" "$BASE_SHA" > "$OUT/SHAS.txt"
ls "$OUT/before" "$OUT/after" | wc -l
echo "shots in $OUT"
