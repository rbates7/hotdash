import { describe, expect, it } from "vitest"

import { APP_STORE_SUSPECT_NOTE } from "@/lib/app-store-summary"
import { CENTRAL } from "@/lib/clock"
import {
  EXCLUDES_APP_STORE,
  breakdownNote,
  breakdownRows,
  breakdownText,
  subscriberTotal,
} from "@/lib/subscriber-total"
import { APP_STORE_CONNECTED, APP_STORE_OFF, APP_STORE_STALE, APP_STORE_ZERO, APP_STORE_ZERO_STALE, LIVE_METRICS } from "@/test/stripe-fixture"

describe("subscriberTotal", () => {
  it("with the App Store connected: (1) + (2) + (3)", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED)
    expect(t.value).toBe(1_337)
    expect([t.stripePaying, t.appStore, t.freeAccounts]).toEqual([1_110, 53, 174])
  })

  it("without it: (1) + (3), and the App Store is null — never 0", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_OFF)
    expect(t.value).toBe(1_284)
    expect(t.appStore).toBeNull()
  })

  it("a connected or stale 0 is suspect: out of the total like not connected, never a real 0", () => {
    for (const zero of [APP_STORE_ZERO, APP_STORE_ZERO_STALE]) {
      const t = subscriberTotal(LIVE_METRICS, zero)
      expect(t.value).toBe(1_284)
      expect(t.appStore).toBeNull()
      expect(t.appStoreSource).toEqual(zero)
      expect(t.series.at(-1)).toBe(t.value)
    }
  })

  it("a stale App Store count is still in the total", () => {
    expect(subscriberTotal(LIVE_METRICS, APP_STORE_STALE).value).toBe(1_337)
  })

  it("history: (1)+(3)'s own, with the App Store held at its count (it has no history)", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED)
    expect(t.previous).toBe(1_080 + 170 + 53)
    expect(t.value - t.previous).toBe(34) // the change in (1)+(3) alone
    expect(t.today).toBe(3)
    expect(t.series).toEqual([1_143, 1_201, 1_246, 1_280, 1_303, 1_337])
    expect(t.series.at(-1)).toBe(t.value)

    const off = subscriberTotal(LIVE_METRICS, APP_STORE_OFF)
    expect(off.value - off.previous).toBe(34)
    expect(off.series.at(-1)).toBe(off.value)
  })
})

describe("breakdown", () => {
  it("three rows, in the definition's order", () => {
    expect(breakdownRows(subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED))).toEqual([
      { key: "stripePaying", label: "Stripe paying", value: "1,110" },
      { key: "appStore", label: "App Store", value: "53" },
      { key: "freeAccounts", label: "Free (never paid)", value: "174" },
    ])
  })

  it("App Store not connected says so, and the total is labelled as excluding it", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_OFF)
    expect(breakdownRows(t)[1]).toEqual({ key: "appStore", label: "App Store", value: "Not connected" })
    expect(breakdownNote(t, CENTRAL)).toBe(EXCLUDES_APP_STORE)
    expect(breakdownText(t, CENTRAL)).toBe(
      "Stripe paying 1,110, App Store Not connected, Free (never paid) 174. Total excludes App Store (not connected)."
    )
  })

  it("connected: no note; stale: when the App Store count is from", () => {
    expect(breakdownNote(subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTED), CENTRAL)).toBeNull()
    expect(breakdownNote(subscriberTotal(LIVE_METRICS, APP_STORE_STALE), CENTRAL)).toBe("App Store as of Tue, Oct 13 · 9:41 AM CDT")
  })

  it("a suspect 0: the row warns instead of saying 0, and the note says to check database access", () => {
    const t = subscriberTotal(LIVE_METRICS, APP_STORE_ZERO)
    expect(breakdownRows(t)[1]).toEqual({
      key: "appStore",
      label: "App Store",
      value: "Check source",
      warning: "Warning: App Store count is suspect",
    })
    expect(breakdownRows(t).map((r) => r.value)).not.toContain("0")
    expect(breakdownNote(t, CENTRAL)).toBe(APP_STORE_SUSPECT_NOTE)
    expect(breakdownNote(subscriberTotal(LIVE_METRICS, APP_STORE_ZERO_STALE), CENTRAL)).toBe(
      APP_STORE_SUSPECT_NOTE
    )
    expect(breakdownText(t, CENTRAL)).toBe(
      "Stripe paying 1,110, App Store Check source (warning), Free (never paid) 174. " +
        "App Store read 0 — check database access (likely a permissions/RLS issue)."
    )
  })

  it("only the App Store row ever warns", () => {
    for (const s of [APP_STORE_CONNECTED, APP_STORE_STALE, APP_STORE_OFF]) {
      expect(breakdownRows(subscriberTotal(LIVE_METRICS, s)).some((r) => r.warning)).toBe(false)
    }
  })
})
