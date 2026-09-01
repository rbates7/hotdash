import { describe, expect, it } from "vitest"

import { signSession, verifySession } from "./cookie"

const SECRET = "test-secret"

describe("session cookie", () => {
  it("verifies a signed session", async () => {
    const token = await signSession(SECRET, Date.now() + 60_000)
    expect(await verifySession(token, SECRET)).toBe(true)
  })

  it("rejects an expired session", async () => {
    const token = await signSession(SECRET, Date.now() - 1)
    expect(await verifySession(token, SECRET)).toBe(false)
  })

  it("rejects a tampered payload", async () => {
    const token = await signSession(SECRET, Date.now() + 60_000)
    const [payload, sig] = token.split(".")
    const tampered = `${Number(payload) + 100_000}.${sig}`
    expect(await verifySession(tampered, SECRET)).toBe(false)
  })

  it("rejects a different secret", async () => {
    const token = await signSession(SECRET, Date.now() + 60_000)
    expect(await verifySession(token, "other-secret")).toBe(false)
  })

  it("rejects garbage", async () => {
    expect(await verifySession("nonsense", SECRET)).toBe(false)
    expect(await verifySession("", SECRET)).toBe(false)
    expect(await verifySession(".sig", SECRET)).toBe(false)
  })
})
