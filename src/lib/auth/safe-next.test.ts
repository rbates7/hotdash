import { describe, expect, it } from "vitest"

import { DEFAULT_NEXT, safeNext } from "@/lib/auth/safe-next"

describe("safeNext", () => {
  it.each([
    ["/crm", "/crm"],
    ["/crm/cases/abc?tab=notes#n1", "/crm/cases/abc?tab=notes#n1"],
    ["/home", "/home"],
    ["/", "/"],
    ["/settings/../crm", "/crm"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })

  it.each([
    ["undefined", undefined],
    ["a number", 42],
    ["empty", ""],
    ["absolute http", "http://evil.example/home"],
    ["absolute https", "https://evil.example"],
    ["protocol-relative", "//evil.example/home"],
    ["backslash", "/\\evil.example"],
    ["encoded-free backslash path", "\\\\evil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["relative without slash", "home"],
    ["tab trick", "/\t/evil.example"],
    ["newline", "/home\n"],
    ["sign-in itself", "/sign-in"],
    ["sign-in with query", "/sign-in?next=/crm"],
    ["too long", `/${"a".repeat(3000)}`],
  ])("falls back to / for %s", (_label, input) => {
    expect(safeNext(input)).toBe(DEFAULT_NEXT)
  })
})
