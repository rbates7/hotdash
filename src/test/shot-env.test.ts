import { execFileSync, spawnSync } from "node:child_process"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  ALLOWED,
  assertNoSecrets,
  blankSecretLike,
  isSecretLike,
  liveDataPaths,
  parseEnvLines,
  secretLikeSet,
  serverEnv,
} from "../../scripts/shot-env.mjs"

/**
 * Screenshot runs must never reach a live service (#60 review: a before set
 * was shot by a server that still had a Sentry token). These run in CI with
 * fake tokens set in the environment and assert none reaches a server.
 */
const ROOT = path.resolve(__dirname, "../..")
const FAKE = "fake-do-not-use-0123456789"
const LIVE_NAMES = [
  "SENTRY_READONLY_TOKEN", "SENTRY_AUTH_TOKEN", "NOTION_READONLY_TOKEN", "NOTION_ROADMAP_PAGE_ID", "NOTION_API_BASE",
  "STRIPE_READONLY_KEY", "STRIPE_API_BASE", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_MAILBOX",
  "GOOGLE_APPLICATION_CREDENTIALS", "POSTHOG_READONLY_KEY", "POSTHOG_HOST", "GITHUB_READONLY_TOKEN", "GITHUB_TOKEN",
  "GH_TOKEN", "github_read_only", "SUPABASE_READONLY_DB_URL", "SOME_NEW_API_KEY", "ACME_SECRET", "X_TOKEN",
]
const dirty = (): NodeJS.ProcessEnv => ({
  ...process.env,
  ...Object.fromEntries(LIVE_NAMES.map((name) => [name, FAKE])),
})

describe("shot-env", () => {
  it("treats every integration prefix and secret word as secret-like, and nothing allowed", () => {
    for (const name of LIVE_NAMES) expect(isSecretLike(name), name).toBe(true)
    for (const name of ALLOWED) expect(isSecretLike(name), name).toBe(false)
  })

  it("serverEnv keeps only the allow-list", () => {
    const env = serverEnv(dirty(), { PORT: "3211" })
    expect(Object.keys(env).every((name) => ALLOWED.includes(name))).toBe(true)
    expect(Object.values(env)).not.toContain(FAKE)
    expect(env.PORT).toBe("3211")
    expect(() => serverEnv({}, { SENTRY_READONLY_TOKEN: FAKE })).toThrow(/SENTRY_READONLY_TOKEN/)
  })

  it("blankSecretLike blanks every secret-like name for a server Playwright starts", () => {
    const merged = { ...dirty(), ...blankSecretLike(dirty(), ["NOTION_API_BASE"]) }
    expect(secretLikeSet(merged)).toEqual([])
    expect(() => assertNoSecrets(dirty(), "test")).toThrow(/SENTRY_READONLY_TOKEN/)
  })

  it("liveDataPaths flags live statuses and rows, never a key-less answer", () => {
    expect(liveDataPaths({ sources: { github: { status: "not_connected" } }, items: [] })).toEqual([])
    expect(liveDataPaths({ sources: { sentry: { status: "connected" } }, items: [{}] })).toEqual([
      "$.sources.sentry.status",
      "$.items",
    ])
    expect(liveDataPaths({ status: "stale" })).toEqual(["$.status"])
  })

  for (const script of ["scripts/inbox-reshoot.sh", "scripts/mrr-cash-reshoot.sh"]) {
    it(`${script} --print-server-env passes no token through, even with tokens set`, () => {
      const out = execFileSync("bash", [script, "--print-server-env", "3299"], {
        cwd: ROOT,
        env: dirty(),
        encoding: "utf8",
      })
      const env = parseEnvLines(out)
      expect(Object.keys(env).sort()).toEqual(Object.keys(env).filter((name) => ALLOWED.includes(name)).sort())
      expect(secretLikeSet(env)).toEqual([])
      expect(out).not.toContain(FAKE)
      expect(env.PORT).toBe("3299")
    })
  }

  it("the env-file check fails on a secret", () => {
    const run = spawnSync("bash", ["-c", 'f=$(mktemp); printf "PATH=/bin\\nSENTRY_READONLY_TOKEN=x\\n" > "$f"; node scripts/shot-env-cli.mjs check "$f"; s=$?; rm -f "$f"; exit $s'], {
      cwd: ROOT,
      encoding: "utf8",
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/SENTRY_READONLY_TOKEN/)
  })
})
