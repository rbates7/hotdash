# shellcheck shell=bash
# Sourced by scripts/*-reshoot.sh. Builds and starts a screenshot server with
# an allow-listed environment only (`env -i` plus PATH, HOME, LANG, TZ,
# NODE_ENV, PORT, …; see scripts/shot-env.mjs), so no token, key or secret
# from this shell — Sentry, Notion, Stripe, Gmail, Google, PostHog, GitHub or
# anything else — and no .env file can reach `next build` or `next start`.
# src/test/shot-env.test.ts runs `--print-server-env` with fake tokens set.

SHOT_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# shot_env_file PORT FILE: write the server env (NAME=VALUE lines, no secrets) to FILE.
shot_env_file() {
  node "$SHOT_LIB_DIR/shot-env-cli.mjs" env "PORT=$1" | tr '\0' '\n' > "$2"
  node "$SHOT_LIB_DIR/shot-env-cli.mjs" check "$2"
}

# shot_print_server_env PORT: the dry run (what a server would see), then exit.
shot_print_server_env() {
  local f
  f=$(mktemp)
  shot_env_file "${1:-3000}" "$f"
  cat "$f"
  rm -f "$f"
}

# refuse_env_files DIR: Next loads DIR/.env*, so there must be none (worktrees
# from git have none: .env* is ignored). Fails rather than moving files.
refuse_env_files() {
  local found
  found=$(find "$1" -maxdepth 1 -name '.env*' ! -name '.env.example' -printf '%f ')
  if [ -n "$found" ]; then echo "refusing to serve $1: it has $found(Next would load it)" >&2; exit 1; fi
}

# shot_run DIR PORT ENVFILE -- CMD…: CMD in DIR with exactly the env in ENVFILE.
shot_run() {
  local dir=$1 envf=$3
  shift 4
  local senv=()
  mapfile -t senv < "$envf"
  refuse_env_files "$dir"
  (cd "$dir" && exec env -i "${senv[@]}" "$@")
}
