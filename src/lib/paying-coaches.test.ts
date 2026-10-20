import { describe, expect, it } from "vitest"

import fixture from "@/lib/__fixtures__/paying-coaches.json"
import {
  PAYING_CONNECTING,
  PAYING_STATUSES,
  PAYING_NOT_CONNECTED,
  TOTAL_ROW,
  countsFromRows,
  parsePayingCoaches,
  payingCoachesView,
} from "@/lib/paying-coaches"

const TZ = "America/Chicago"

describe("countsFromRows", () => {
  it("maps the exact method values and the total row", () => {
    const c = countsFromRows(fixture.rows)!
    expect(c.appStore + c.stripe + c.invoice + c.other).toBe(c.total)
    expect(c).toEqual(fixture.counts)
  })
  it("puts unknown methods in other, and keeps the distinct total as given", () => {
    const c = countsFromRows([
      { method: "Stripe", n: 3 },
      { method: "PayPal", n: 2 },
      { method: null, n: 1 },
      { method: TOTAL_ROW, n: 5 },
    ])!
    expect(c).toEqual({ appStore: 0, stripe: 3, invoice: 0, other: 3, total: 5 })
  })
  it("is null for a bad answer", () => {
    expect(countsFromRows(null)).toBeNull()
    expect(countsFromRows([{ method: "Stripe", n: 1 }])).toBeNull() // no total
    expect(countsFromRows([{ method: TOTAL_ROW, n: -1 }])).toBeNull()
    expect(countsFromRows([{ method: TOTAL_ROW, n: "7" }])).toBeNull()
    expect(countsFromRows([{ method: TOTAL_ROW, n: 1.5 }])).toBeNull()
  })
})

describe("parsePayingCoaches", () => {
  const good = { status: "connected", counts: fixture.counts, asOf: "2026-10-19T20:00:00.000Z" }
  it("round-trips every status", () => {
    expect(parsePayingCoaches(good)).toEqual(good)
    expect(parsePayingCoaches({ ...good, status: "stale" })?.status).toBe("stale")
    expect(parsePayingCoaches({ status: "connecting" })).toBe(PAYING_CONNECTING)
    expect(parsePayingCoaches({ status: "not_connected" })).toBe(PAYING_NOT_CONNECTED)
  })
  it("rejects anything incomplete", () => {
    expect(parsePayingCoaches(null)).toBeNull()
    expect(parsePayingCoaches({ status: "live" })).toBeNull()
    expect(parsePayingCoaches({ ...good, asOf: "nope" })).toBeNull()
    expect(parsePayingCoaches({ ...good, counts: { ...fixture.counts, total: -2 } })).toBeNull()
    expect(parsePayingCoaches({ ...good, counts: undefined })).toBeNull()
  })
  it("drops extra fields", () => {
    const parsed = parsePayingCoaches({ ...good, counts: { ...fixture.counts, names: ["x"] }, url: "x" }) as { counts: object }
    expect(Object.keys(parsed.counts).sort()).toEqual(["appStore", "invoice", "other", "stripe", "total"])
    expect(parsed).not.toHaveProperty("url")
  })
})

describe("payingCoachesView", () => {
  it("loading, connecting and not connected show no figures", () => {
    expect(payingCoachesView(null, TZ)).toEqual({ kind: "loading", connecting: false })
    expect(payingCoachesView(PAYING_CONNECTING, TZ)).toEqual({ kind: "loading", connecting: true })
    expect(payingCoachesView(PAYING_NOT_CONNECTED, TZ)).toEqual({ kind: "not_connected" })
  })
  it("live: grouped total, three method rows, no updated line when fresh", () => {
    const v = payingCoachesView({ status: "connected", counts: { appStore: 12, stripe: 1234, invoice: 5, other: 0, total: 1251 }, asOf: "2026-10-19T20:00:00.000Z" }, TZ)
    expect(v).toEqual({
      kind: "live",
      total: "1,251",
      updated: null,
      rows: [
        { key: "appStore", label: "App Store", value: "12" },
        { key: "stripe", label: "Stripe", value: "1,234" },
        { key: "invoice", label: "Invoice", value: "5" },
      ],
    })
  })
  it("adds an Other row only when needed, and a Last updated line when stale", () => {
    const v = payingCoachesView({ status: "stale", counts: { appStore: 1, stripe: 1, invoice: 1, other: 2, total: 5 }, asOf: "2026-10-19T20:00:00.000Z" }, TZ)
    if (v.kind !== "live") throw new Error("expected live")
    expect(v.rows.map((r) => r.key)).toEqual(["appStore", "stripe", "invoice", "other"])
    expect(v.updated).toMatch(/^Last updated .*3:00\sPM CDT$/)
  })
})

describe("overlap: rows can add up to more than the total", () => {
  const rows = [
    { method: "AppStore", n: 40 },
    { method: "Stripe", n: 900 },
    { method: "invoice", n: 60 },
    { method: TOTAL_ROW, n: 990 },
  ]
  it("keeps the distinct total as the database gave it, not the rows' sum", () => {
    const c = countsFromRows(rows)!
    expect(c.appStore + c.stripe + c.invoice + c.other).toBe(1000)
    expect(c.total).toBe(990)
    expect(c.appStore + c.stripe + c.invoice + c.other).toBeGreaterThan(c.total)
  })
  it("the tile shows the total and each row as given", () => {
    const v = payingCoachesView({ status: "connected", counts: countsFromRows(rows)!, asOf: "2026-10-19T20:00:00.000Z" }, TZ)
    if (v.kind !== "live") throw new Error("expected live")
    expect(v.total).toBe("990")
    expect(v.rows.map((r) => r.value)).toEqual(["40", "900", "60"])
  })
})

describe("status set", () => {
  it("is active only (pending Radcliffe), not Subscribers' active + past_due", () => {
    expect(PAYING_STATUSES).toEqual(["active"])
  })
})
