// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  TOKEN_EXPIRY_MARGIN_MS,
  TOKEN_URL,
  classifyGoogleError,
  createGmailService,
  createTokenCache,
  failureDetail,
  failureKind,
  gmailLoader,
  googleErrorDetail,
  readGmailConfig,
} from "@/lib/server/gmail"
import { gmailApiThread, gmailFixtureThreads } from "@/test/gmail-fixture"

/** Fake credentials: shaped like Google's, valid nowhere. */
const CLIENT_ID = "123456-hotdashdiagtest.apps.googleusercontent.com"
const SECRET = "GOCSPX-hotdashDiagTestOnlySecret0"
const REFRESH = "1//hotdashDiagTestOnlyRefreshToken0"
const ACCESS = "ya29.diag-test-access-token-0"
/** A secret with no digits or dots, so it is code-shaped: must still never be logged. */
const LETTERS_SECRET = "hotdashLettersOnlySecretValue"
const ENV = { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: SECRET, GMAIL_REFRESH_TOKEN: REFRESH }
const CONFIG = readGmailConfig(ENV) as Extract<ReturnType<typeof readGmailConfig>, { kind: "ok" }>
const TOKENISH = [CLIENT_ID, SECRET, REFRESH, ACCESS, LETTERS_SECRET, "Bearer"]
const THREADS = gmailFixtureThreads(Date.parse("2026-10-14T17:00:00.000Z"))

afterEach(() => {
  vi.restoreAllMocks()
})

type Answers = { token?: () => Response; api?: () => Response }

/** Google, faked: counts token exchanges; every Gmail read answers `api()` or the fixture. */
function fakeGoogle(answers: Answers = {}) {
  let tokenCalls = 0
  const byId = new Map(THREADS.map((t) => [t.id, gmailApiThread(t)]))
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === TOKEN_URL) {
      tokenCalls += 1
      return answers.token?.() ?? Response.json({ access_token: `${ACCESS}${tokenCalls}`, expires_in: 3599, token_type: "Bearer" })
    }
    if (answers.api) return answers.api()
    const u = new URL(url)
    if (u.pathname.endsWith("/threads")) return Response.json({ threads: [...byId.keys()].map((id) => ({ id })) })
    return Response.json(byId.get(u.pathname.split("/").pop()!))
  }) as unknown as typeof fetch
  return { fetchImpl, tokenCalls: () => tokenCalls }
}

/** Every token-like string we know, and none of them may be in `text`. */
function expectNoSecrets(text: string) {
  for (const s of TOKENISH) expect(text).not.toContain(s)
  expect(text).not.toMatch(/ya29\.|1\/\/|GOCSPX-/)
}

describe("Google's error fields (codes only)", () => {
  it("keeps the OAuth error code and drops error_description and anything echoed", () => {
    const d = googleErrorDetail("token", 400, { error: "invalid_grant", error_description: `Bad ${REFRESH}` }, [SECRET, REFRESH])
    expect(d).toEqual({ step: "token", status: 400, error: "invalid_grant" })
  })

  it("keeps the Gmail API status and reasons, never message", () => {
    const body = {
      error: {
        code: 403,
        message: `Quota for ${ACCESS}`,
        status: "PERMISSION_DENIED",
        errors: [{ reason: "userRateLimitExceeded", message: "x", domain: "usageLimits" }, { reason: "userRateLimitExceeded" }],
      },
    }
    expect(googleErrorDetail("api", 403, body)).toEqual({
      step: "api",
      status: 403,
      apiStatus: "PERMISSION_DENIED",
      reasons: ["userRateLimitExceeded"],
    })
  })

  it("drops token-shaped values even in code fields, and any configured secret", () => {
    expect(googleErrorDetail("token", 400, { error: ACCESS })).toEqual({ step: "token", status: 400 })
    expect(googleErrorDetail("token", 400, { error: REFRESH })).toEqual({ step: "token", status: 400 })
    expect(googleErrorDetail("token", 400, { error: LETTERS_SECRET }, [LETTERS_SECRET])).toEqual({ step: "token", status: 400 })
    expect(googleErrorDetail("api", 403, { error: { status: "a sentence, not a code", errors: [{ reason: SECRET }] } })).toEqual({
      step: "api",
      status: 403,
    })
    expect(googleErrorDetail("api", 500, "<html>oops</html>")).toEqual({ step: "api", status: 500 })
    expect(googleErrorDetail("api", 502, null)).toEqual({ step: "api", status: 502 })
  })

  it.each([
    [{ step: "api", status: 403, reasons: ["userRateLimitExceeded"] }, "GmailRateLimited"],
    [{ step: "api", status: 403, reasons: ["rateLimitExceeded"] }, "GmailRateLimited"],
    [{ step: "api", status: 403, reasons: ["quotaExceeded"] }, "GmailRateLimited"],
    [{ step: "api", status: 403, reasons: ["dailyLimitExceeded"] }, "GmailRateLimited"],
    [{ step: "api", status: 429, apiStatus: "RESOURCE_EXHAUSTED" }, "GmailRateLimited"],
    [{ step: "token", status: 429 }, "GmailRateLimited"],
    [{ step: "api", status: 403, reasons: ["insufficientPermissions"] }, "GmailAuth"],
    [{ step: "api", status: 403 }, "GmailAuth"],
    [{ step: "api", status: 401, apiStatus: "UNAUTHENTICATED" }, "GmailAuth"],
    [{ step: "token", status: 400, error: "invalid_grant" }, "GmailAuth"],
    [{ step: "token", status: 401, error: "unauthorized_client" }, "GmailAuth"],
    [{ step: "token", status: 503 }, "GmailApi"],
    [{ step: "api", status: 500 }, "GmailApi"],
  ] as const)("%o is %s", (detail, kind) => {
    expect(classifyGoogleError({ ...detail, reasons: "reasons" in detail ? [...detail.reasons] : undefined })).toBe(kind)
  })
})

describe("the loader's errors and the log line", () => {
  it("a 403 quota reason from Gmail is GmailRateLimited, logged as rate limited", async () => {
    const { fetchImpl } = fakeGoogle({
      api: () => Response.json({ error: { code: 403, message: "slow down", errors: [{ reason: "userRateLimitExceeded" }] } }, { status: 403 }),
    })
    const error = await gmailLoader(fetchImpl)(CONFIG).catch((e: unknown) => e)
    expect(failureKind(error)).toBe("GmailRateLimited")
    expect(failureDetail(error)).toBe("rate limited: api status=403 reason=userRateLimitExceeded")
  })

  it("a refused refresh token is GmailAuth, logged as invalid token with the OAuth code", async () => {
    const { fetchImpl } = fakeGoogle({
      token: () => Response.json({ error: "invalid_grant", error_description: `Token has been expired or revoked: ${REFRESH}` }, { status: 400 }),
    })
    const error = await gmailLoader(fetchImpl)(CONFIG).catch((e: unknown) => e)
    expect(failureKind(error)).toBe("GmailAuth")
    expect(failureDetail(error)).toBe("invalid token or grant: token status=400 error=invalid_grant")
  })

  it("the default log line names the code and none of the secrets, whatever Google echoes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const echo = `${CLIENT_ID} ${SECRET} ${REFRESH} ${ACCESS} Bearer ${ACCESS}`
    for (const answers of [
      { token: () => Response.json({ error: "unauthorized_client", error_description: echo, client_secret: SECRET }, { status: 401 }) },
      { api: () => Response.json({ error: { status: "PERMISSION_DENIED", message: echo, errors: [{ reason: "insufficientPermissions", message: echo }] } }, { status: 403 }) },
      { api: () => new Response(echo, { status: 500 }) },
    ] satisfies Answers[]) {
      const { fetchImpl } = fakeGoogle(answers)
      const svc = createGmailService({ env: () => ENV, load: gmailLoader(fetchImpl) })
      await svc.summary()
      await svc.settled()
    }
    const lines = warn.mock.calls.map((c) => c.join(" "))
    expect(lines).toEqual([
      "[gmail] sync failed: GmailAuth (invalid token or grant: token status=401 error=unauthorized_client)",
      "[gmail] sync failed: GmailAuth (invalid token or grant: api status=403 apiStatus=PERMISSION_DENIED reason=insufficientPermissions)",
      "[gmail] sync failed: GmailApi (Gmail API error: api status=500)",
    ])
    expectNoSecrets(lines.join("\n"))
  })

  it("failureDetail is null for anything but a GmailError with fields", () => {
    expect(failureDetail(new Error(SECRET))).toBeNull()
    expect(failureDetail({ type: "GmailAuth", detail: { step: "token", status: 400, error: SECRET } })).toBeNull()
  })
})

describe("access-token cache (one per server instance)", () => {
  it("single-flight: concurrent callers share one refresh", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      await gate
      return Response.json({ access_token: ACCESS, expires_in: 3599 })
    }) as unknown as typeof fetch
    const tokens = createTokenCache(fetchImpl, () => 0)
    const all = Promise.all([tokens.get(CONFIG), tokens.get(CONFIG), tokens.get(CONFIG), tokens.get(CONFIG)])
    release()
    expect(await all).toEqual([ACCESS, ACCESS, ACCESS, ACCESS])
    expect(calls).toBe(1)
  })

  it("reuses the token until shortly before expires_in, then refreshes", async () => {
    let now = 0
    const { fetchImpl, tokenCalls } = fakeGoogle()
    const tokens = createTokenCache(fetchImpl, () => now)
    expect(await tokens.get(CONFIG)).toBe(`${ACCESS}1`)
    now = 3599_000 - TOKEN_EXPIRY_MARGIN_MS - 1
    expect(await tokens.get(CONFIG)).toBe(`${ACCESS}1`)
    expect(tokenCalls()).toBe(1)
    now = 3599_000 - TOKEN_EXPIRY_MARGIN_MS
    expect(await tokens.get(CONFIG)).toBe(`${ACCESS}2`)
    expect(tokenCalls()).toBe(2)
  })

  it("a failed refresh is not cached; the next call tries again", async () => {
    let fail = true
    const { fetchImpl, tokenCalls } = fakeGoogle({
      token: () => (fail ? Response.json({ error: "invalid_grant" }, { status: 400 }) : Response.json({ access_token: ACCESS, expires_in: 3599 })),
    })
    const tokens = createTokenCache(fetchImpl, () => 0)
    await expect(tokens.get(CONFIG)).rejects.toMatchObject({ type: "GmailAuth" })
    fail = false
    expect(await tokens.get(CONFIG)).toBe(ACCESS)
    expect(tokenCalls()).toBe(2)
  })

  it("no expires_in: the token is used once, never reused", async () => {
    const { fetchImpl, tokenCalls } = fakeGoogle({ token: () => Response.json({ access_token: ACCESS }) })
    const tokens = createTokenCache(fetchImpl, () => 0)
    await tokens.get(CONFIG)
    await tokens.get(CONFIG)
    expect(tokenCalls()).toBe(2)
  })

  it("other credentials never get the cached token", async () => {
    const { fetchImpl, tokenCalls } = fakeGoogle()
    const tokens = createTokenCache(fetchImpl, () => 0)
    await tokens.get(CONFIG)
    await tokens.get({ ...CONFIG, refreshToken: "1//hotdashOtherRefreshToken0" })
    expect(tokenCalls()).toBe(2)
  })

  it("syncs reuse the token across loader runs, and a 401 from Gmail forces a refresh next time", async () => {
    let unauthorized = false
    const byId = new Map(THREADS.map((t) => [t.id, gmailApiThread(t)]))
    let tokenCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === TOKEN_URL) {
        tokenCalls += 1
        return Response.json({ access_token: `${ACCESS}${tokenCalls}`, expires_in: 3599 })
      }
      if (unauthorized) return Response.json({ error: { status: "UNAUTHENTICATED" } }, { status: 401 })
      const u = new URL(url)
      if (u.pathname.endsWith("/threads")) return Response.json({ threads: [...byId.keys()].map((id) => ({ id })) })
      return Response.json(byId.get(u.pathname.split("/").pop()!))
    }) as unknown as typeof fetch
    const load = gmailLoader(fetchImpl, createTokenCache(fetchImpl, () => 0))
    await load(CONFIG)
    await load(CONFIG)
    expect(tokenCalls).toBe(1)
    unauthorized = true
    await expect(load(CONFIG)).rejects.toMatchObject({ type: "GmailAuth" })
    unauthorized = false
    await load(CONFIG)
    expect(tokenCalls).toBe(2)
  })
})
