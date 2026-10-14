import { spawnSync } from "node:child_process"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { hashPassword, parsePasswordHash, verifyPassword } from "@/lib/auth/password"
import { TEST_PASSWORD, TEST_PASSWORD_HASH } from "../../../e2e/support/test-credentials"

// Cheap parameters keep the suite fast; the default (N=2^15) is covered by
// the committed test hash and the script check below.
const FAST = { N: 2 ** 10, r: 8, p: 1 }

describe("hashPassword / verifyPassword", () => {
  it("produces scrypt$N$r$p$salt$hash and verifies the same password", async () => {
    const stored = await hashPassword("correct horse battery", FAST)
    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(await verifyPassword("correct horse battery", stored)).toBe(true)
  })

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery", FAST)
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false)
    expect(await verifyPassword("", stored)).toBe(false)
  })

  it("salts every hash", async () => {
    const a = await hashPassword("same", FAST)
    const b = await hashPassword("same", FAST)
    expect(a).not.toBe(b)
  })

  it("verifies the committed test-only e2e hash (default parameters)", async () => {
    expect(await verifyPassword(TEST_PASSWORD, TEST_PASSWORD_HASH)).toBe(true)
  })

  it.each([
    ["empty", ""],
    ["wrong scheme", "bcrypt$10$abc$def$ghi$jkl"],
    ["too few parts", "scrypt$1024$8$1$c2FsdHNhbHQ="],
    ["N not a power of two", "scrypt$1000$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA=="],
    ["N too large", `scrypt$${2 ** 21}$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==`],
    ["r out of range", "scrypt$1024$99$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA=="],
    ["non-numeric p", "scrypt$1024$8$x$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA=="],
    ["short salt", "scrypt$1024$8$1$YQ==$aGFzaGhhc2hoYXNoaGFzaA=="],
  ])("treats a malformed hash (%s) as a mismatch", async (_label, stored) => {
    expect(parsePasswordHash(stored)).toBeNull()
    expect(await verifyPassword("anything", stored)).toBe(false)
  })
})

describe("scripts/hash-password.mjs", () => {
  const script = path.resolve(__dirname, "../../../scripts/hash-password.mjs")

  it("prints a hash that verifyPassword accepts", async () => {
    const run = spawnSync(process.execPath, [script], { input: "a-long-enough-password\n" })
    expect(run.status).toBe(0)
    const stored = run.stdout.toString().trim()
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(await verifyPassword("a-long-enough-password", stored)).toBe(true)
  })

  it("refuses a short password", () => {
    const run = spawnSync(process.execPath, [script], { input: "short" })
    expect(run.status).toBe(1)
    expect(run.stdout.toString()).toBe("")
  })
})
