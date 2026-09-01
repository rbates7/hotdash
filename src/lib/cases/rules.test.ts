import { describe, expect, it } from "vitest"

import type { CaseStatus } from "@/lib/db/schema"

import { cleanSubject, transitionOnMessage } from "./rules"

describe("transitionOnMessage", () => {
  const matrix: Array<
    [CaseStatus, "inbound" | "outbound", CaseStatus, boolean]
  > = [
    ["new", "inbound", "new", false],
    ["open", "inbound", "open", false],
    ["waiting", "inbound", "open", false],
    ["closed", "inbound", "open", true],
    ["new", "outbound", "waiting", false],
    ["open", "outbound", "waiting", false],
    ["waiting", "outbound", "waiting", false],
    ["closed", "outbound", "closed", false],
  ]

  it.each(matrix)(
    "%s + %s message → %s (reopened=%s)",
    (from, direction, to, reopened) => {
      expect(transitionOnMessage(from, direction)).toEqual({
        status: to,
        reopened,
      })
    }
  )
})

describe("cleanSubject", () => {
  it("strips reply/forward prefixes repeatedly", () => {
    expect(cleanSubject("Re: Re: Fwd: Billing question")).toBe(
      "Billing question"
    )
    expect(cleanSubject("FW: hello")).toBe("hello")
    expect(cleanSubject("re:re:  spaced")).toBe("spaced")
  })

  it("keeps normal subjects", () => {
    expect(cleanSubject("Regarding the invoice")).toBe("Regarding the invoice")
  })

  it("falls back for empty subjects", () => {
    expect(cleanSubject(null)).toBe("(no subject)")
    expect(cleanSubject("Re: ")).toBe("(no subject)")
  })
})
