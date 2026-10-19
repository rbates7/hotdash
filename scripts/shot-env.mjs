// @ts-check
/**
 * The environment a screenshot server (next build / next start) may see.
 *
 * Screenshot runs must never reach a live service: an image of a real
 * Sentry issue, Gmail thread, Stripe figure or Notion page would be a leak.
 * So the reshoot scripts start servers with `env -i` plus only the
 * allow-listed, non-secret names below (`serverEnv`), and Playwright blanks
 * every secret-like name for a server it starts (`blankSecretLike`). Both
 * are checked with `secretLikeSet` / `assertNoSecrets`, and
 * src/test/shot-env.test.ts runs it all in CI with fake tokens set.
 *
 * The reshoot scripts use it through scripts/shot-env-cli.mjs.
 */
/** The only names a screenshot server inherits. None can carry a credential. */
export const ALLOWED = ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR", "NODE_ENV", "PORT", "NEXT_TELEMETRY_DISABLED", "COREPACK_HOME"]

/** Integration prefixes and secret-ish words; matched case-insensitively. */
const SECRET_PREFIX = /^(SENTRY|NOTION|STRIPE|GMAIL|GOOGLE|POSTHOG|GITHUB|GH|SUPABASE|DATABASE|VERCEL|SLACK|OPENAI|ANTHROPIC|AWS|NEXT_PUBLIC)_/i
const SECRET_WORD = /(TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION|DSN|PRIVATE|DB_URL|DATABASE_URL|github_read_only)/i

/** @param {string} name */
export function isSecretLike(name) {
  return !ALLOWED.includes(name) && (SECRET_PREFIX.test(name) || SECRET_WORD.test(name))
}

/**
 * Names in `env` that are secret-like and non-empty (never the values).
 * @param {Record<string, string | undefined>} env
 */
export function secretLikeSet(env) {
  return Object.keys(env)
    .filter((name) => isSecretLike(name) && (env[name] ?? "") !== "")
    .sort()
}

/** @param {Record<string, string | undefined>} env @param {string} where */
export function assertNoSecrets(env, where) {
  const found = secretLikeSet(env)
  if (found.length > 0) {
    throw new Error(`${where}: secret-like variables are set (${found.join(", ")}); screenshot servers must have none`)
  }
}

/**
 * The allow-listed slice of `source`, plus `extra` (e.g. PORT). Throws if
 * `extra` tries to add a secret-like value.
 * @param {Record<string, string | undefined>} source
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function serverEnv(source, extra = {}) {
  /** @type {Record<string, string>} */
  const env = { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }
  for (const name of ALLOWED) {
    const value = source[name]
    if (value !== undefined && value !== "") env[name] = value
  }
  Object.assign(env, extra)
  assertNoSecrets(env, "serverEnv")
  return env
}

/**
 * For a server Playwright starts (it merges this over process.env): every
 * secret-like name in `source` and in `known`, set to "".
 * @param {Record<string, string | undefined>} source
 * @param {string[]} [known]
 * @returns {Record<string, string>}
 */
export function blankSecretLike(source, known = []) {
  /** @type {Record<string, string>} */
  const env = {}
  for (const name of [...Object.keys(source), ...known]) if (isSecretLike(name) || known.includes(name)) env[name] = ""
  return env
}

/**
 * Where a JSON body from the app's own /api/* looks like live data: a
 * `status`/`state` of connected, stale or live, or a non-empty `items` or
 * `rows` list. A key-less server can only answer "not connected", so any hit
 * means a credential reached it. Returns JSON paths, never values.
 * @param {unknown} body @param {string} [at]
 * @returns {string[]}
 */
export function liveDataPaths(body, at = "$") {
  if (Array.isArray(body)) return body.flatMap((v, i) => liveDataPaths(v, `${at}[${i}]`))
  if (body === null || typeof body !== "object") return []
  /** @type {string[]} */
  const hits = []
  for (const [key, value] of Object.entries(body)) {
    const here = `${at}.${key}`
    if ((key === "status" || key === "state") && ["connected", "stale", "live"].includes(String(value))) hits.push(here)
    else if ((key === "items" || key === "rows") && Array.isArray(value) && value.length > 0) hits.push(here)
    else hits.push(...liveDataPaths(value, here))
  }
  return hits
}

/** @param {string} text NAME=VALUE lines @returns {Record<string, string>} */
export function parseEnvLines(text) {
  /** @type {Record<string, string>} */
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf("=")
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return env
}
