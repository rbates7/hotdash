import { describe, expect, it } from "vitest"

import { ageAnchor, caseAgeMs, isOverdue } from "./age"

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 8, 2, 12)
const at = (daysAgo: number) => new Date(now - daysAgo * DAY)

describe("case age", () => {
  it("counts from their last message when they spoke last", () => {
    const waiting = {
      status: "open",
      createdAt: at(10),
      lastInboundAt: at(4),
      lastOutboundAt: at(6),
    }
    expect(ageAnchor(waiting)).toEqual(at(4))
    expect(caseAgeMs(waiting, now)).toBe(4 * DAY)
    expect(isOverdue(waiting, now)).toBe(true)
  })

  it("counts from when the case opened once you have answered", () => {
    const answered = {
      status: "waiting",
      createdAt: at(10),
      lastInboundAt: at(4),
      lastOutboundAt: at(1),
    }
    expect(ageAnchor(answered)).toEqual(at(10))
    expect(isOverdue(answered, now)).toBe(false)
  })

  it("is not overdue until three days have passed, and never once closed", () => {
    const fresh = { status: "new", createdAt: at(2), lastInboundAt: at(2), lastOutboundAt: null }
    expect(isOverdue(fresh, now)).toBe(false)
    expect(isOverdue({ ...fresh, lastInboundAt: at(3), createdAt: at(3) }, now)).toBe(true)
    expect(isOverdue({ ...fresh, status: "closed", lastInboundAt: at(30) }, now)).toBe(false)
  })

  it("never reports a negative age", () => {
    expect(caseAgeMs({ status: "new", createdAt: new Date(now + DAY), lastInboundAt: null, lastOutboundAt: null }, now)).toBe(0)
  })
})
