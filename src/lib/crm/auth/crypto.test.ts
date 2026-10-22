import { describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret } from "./crypto"

const SECRET = "app-secret-value"

describe("secret encryption", () => {
  it("round-trips", () => {
    const encrypted = encryptSecret("refresh-token-123", SECRET)
    expect(decryptSecret(encrypted, SECRET)).toBe("refresh-token-123")
  })

  it("uses a fresh IV per call", () => {
    const a = encryptSecret("same-value", SECRET)
    const b = encryptSecret("same-value", SECRET)
    expect(a).not.toBe(b)
  })

  it("fails with the wrong secret", () => {
    const encrypted = encryptSecret("refresh-token-123", SECRET)
    expect(() => decryptSecret(encrypted, "wrong")).toThrow()
  })

  it("fails on malformed input", () => {
    expect(() => decryptSecret("not-valid", SECRET)).toThrow()
  })
})
