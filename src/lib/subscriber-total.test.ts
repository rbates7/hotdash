import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import {
  EXCLUDES_APP_STORE,
  EXCLUDES_INVOICE,
  breakdownNote,
  breakdownRows,
  breakdownText,
  subscriberTotal,
} from "@/lib/subscriber-total"
import { APP_STORE_CONNECTED, APP_STORE_OFF, APP_STORE_STALE, LIVE_METRICS, SYNCED_AT } from "@/test/stripe-fixture"

/** A reading from an older server: the App Store count, no invoice count. */
const NO_INVOICE = { status: "connected", count: 53, asOf: SYNCED_AT } as const

describe("subscriberTotal", () => {
  it("with Chlk's database connected: (1) + (2) + (3) + (4)", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED)
    expect(t.value).toBe(1_414)
    expect([t.stripePaying, t.appStore, t.invoice, t.freeAccounts]).toEqual([1_107, 53, 83, 171])
  })

  it("without it: (1) + (4), and App Store and invoice are null — never 0", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_OFF)
    expect(t.value).toBe(1_278)
    expect(t.appStore).toBeNull()
    expect(t.invoice).toBeNull()
  })

  it("stale counts are still in the total", () => {
    expect(subscriberTotal(LIVE_METRICS, APP_STORE_STALE).value).toBe(1_414)
  })

  it("a reading without an invoice count: App Store in, invoice null and out — never 0", () => {
    const t = subscriberTotal(LIVE_METRICS, NO_INVOICE)
    expect(t.value).toBe(1_107 + 53 + 171)
    expect(t.invoice).toBeNull()
  })

  it("history: (1)+(4)'s own, with App Store and invoice held at their counts (they have no history)", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED)
    expect(t.previous).toBe(1_077 + 167 + 53 + 83)
    expect(t.value - t.previous).toBe(34) // the change in (1)+(4) alone
    expect(t.today).toBe(3)
    expect(t.series).toEqual([1_220, 1_278, 1_323, 1_357, 1_380, 1_414])
    expect(t.series.at(-1)).toBe(t.value)

    const off = subscriberTotal(LIVE_METRICS, APP_STORE_OFF)
    expect(off.value - off.previous).toBe(34)
    expect(off.series.at(-1)).toBe(off.value)
  })
})

describe("breakdown", () => {
  it("four rows, in the definition's order", () => {
    expect(breakdownRows(subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED))).toEqual([
      { key: "stripePaying", label: "Stripe paying", value: "1,107" },
      { key: "appStore", label: "App Store", value: "53" },
      { key: "invoice", label: "Invoice (school/district)", value: "83" },
      { key: "freeAccounts", label: "Free (never paid)", value: "171" },
    ])
  })

  it("not connected says so on both rows, and the total is labelled as excluding them", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_OFF)
    expect(breakdownRows(t)[1]).toEqual({ key: "appStore", label: "App Store", value: "Not connected" })
    expect(breakdownRows(t)[2]).toEqual({ key: "invoice", label: "Invoice (school/district)", value: "Not connected" })
    expect(breakdownNote(t, CENTRAL)).toBe(EXCLUDES_APP_STORE)
    expect(breakdownText(t, CENTRAL)).toBe(
      "Stripe paying 1,107, App Store Not connected, Invoice (school/district) Not connected, Free (never paid) 171. " +
        "Total excludes App Store and invoice (not connected)."
    )
  })

  it("no invoice count: a dash, and the total says it leaves invoice out", () => {
    const t = subscriberTotal(LIVE_METRICS, NO_INVOICE)
    expect(breakdownRows(t)[2]).toEqual({ key: "invoice", label: "Invoice (school/district)", value: "—" })
    expect(breakdownNote(t, CENTRAL)).toBe(EXCLUDES_INVOICE)
    expect(breakdownNote(subscriberTotal(LIVE_METRICS, { ...NO_INVOICE, status: "stale" }), CENTRAL)).toBe(
      "App Store as of Tue, Oct 13 · 9:41 AM CDT. Total excludes invoice (not reported)"
    )
  })

  it("connected: no note; stale: when the counts are from", () => {
    expect(breakdownNote(subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED), CENTRAL)).toBeNull()
    expect(breakdownNote(subscriberTotal(LIVE_METRICS, APP_STORE_STALE), CENTRAL)).toBe(
      "App Store and invoice as of Tue, Oct 13 · 9:41 AM CDT"
    )
  })
})
