import { describe, expect, it } from "vitest"

import {
  WORKBOARD_LOADING_VIEW,
  WORKBOARD_NOT_CONNECTED,
  formatWorkboardTime,
  groupByState,
  ownerName,
  parseWorkboardResponse,
  workboardKind,
  workboardReducer,
} from "@/lib/workboard-view"
import { LIVE_ITEMS, workboardItem, workboardSummary } from "@/test/workboard-fixture"

describe("parseWorkboardResponse", () => {
  it("reads each status the route sends", () => {
    for (const status of ["connected", "stale", "connecting", "not_connected"] as const) {
      expect(parseWorkboardResponse(workboardSummary(status))).toEqual(workboardSummary(status))
    }
  })

  it("rejects anything that is not the contract: null, an HTML 404, an unknown status, no items", () => {
    expect(parseWorkboardResponse(null)).toBeNull()
    expect(parseWorkboardResponse("<html>404</html>")).toBeNull()
    expect(parseWorkboardResponse({ ...workboardSummary("connected"), status: "sample" })).toBeNull()
    expect(parseWorkboardResponse({ status: "connected", fetchedAt: "" })).toBeNull()
  })

  it("never lets connecting or not_connected carry rows, and derives connected/stale from status", () => {
    const sneaky = { status: "not_connected", connected: true, stale: true, fetchedAt: "", items: LIVE_ITEMS }
    expect(parseWorkboardResponse(sneaky)).toEqual({ ...WORKBOARD_NOT_CONNECTED })
    expect(parseWorkboardResponse({ ...sneaky, status: "connecting" })?.items).toEqual([])
  })

  it("drops rows off the contract (bad state, no https url) and fills unknown CI/review as none", () => {
    const body = {
      ...workboardSummary("connected"),
      items: [
        workboardItem({ number: 1 }),
        { ...workboardItem({ number: 2 }), state: "sample" },
        { ...workboardItem({ number: 3 }), url: "javascript:alert(1)" },
        { ...workboardItem({ number: 4 }), ci: "green", review: "lgtm", proofLinks: ["http://x.png", "https://a.png"] },
      ],
    }
    const items = parseWorkboardResponse(body)!.items
    expect(items.map((i) => i.number)).toEqual([1, 4])
    expect(items[1]).toMatchObject({ ci: "none", review: "none", proofLinks: ["https://a.png"] })
  })
})

describe("workboardReducer", () => {
  it("an answer replaces whatever was there", () => {
    expect(workboardReducer(WORKBOARD_LOADING_VIEW, { type: "summary", summary: workboardSummary("connected") })).toEqual({
      phase: "ready",
      summary: workboardSummary("connected"),
    })
  })

  it("our endpoint failing keeps the last rows, marked stale", () => {
    const view = workboardReducer({ phase: "ready", summary: workboardSummary("connected") }, { type: "failure" })
    expect(view).toEqual({ phase: "ready", summary: workboardSummary("stale") })
  })

  it("failing before any rows, or while connecting, reads as not connected (never an empty board)", () => {
    expect(workboardReducer(WORKBOARD_LOADING_VIEW, { type: "failure" })).toEqual({ phase: "ready", summary: WORKBOARD_NOT_CONNECTED })
    expect(workboardReducer({ phase: "ready", summary: workboardSummary("connecting") }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: WORKBOARD_NOT_CONNECTED,
    })
  })
})

describe("workboardKind", () => {
  it("loading and connecting are connecting; then not connected, empty, live; stale is live or empty", () => {
    expect(workboardKind(WORKBOARD_LOADING_VIEW)).toBe("connecting")
    expect(workboardKind({ phase: "ready", summary: workboardSummary("connecting") })).toBe("connecting")
    expect(workboardKind({ phase: "ready", summary: workboardSummary("not_connected") })).toBe("not_connected")
    expect(workboardKind({ phase: "ready", summary: workboardSummary("connected", []) })).toBe("empty")
    expect(workboardKind({ phase: "ready", summary: workboardSummary("connected") })).toBe("live")
    expect(workboardKind({ phase: "ready", summary: workboardSummary("stale") })).toBe("live")
    expect(workboardKind({ phase: "ready", summary: workboardSummary("stale", []) })).toBe("empty")
  })
})

describe("helpers", () => {
  it("maps bot logins to names and leaves others alone", () => {
    expect(ownerName("simmons-bot")).toBe("Simmons")
    expect(ownerName("Radcliffe")).toBe("Radcliffe")
    expect(ownerName("rbates7")).toBe("rbates7")
  })

  it("groups rows into the four columns", () => {
    const g = groupByState(LIVE_ITEMS)
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((i) => i.number)]))).toEqual({
      working: [52],
      needs_fix: [50],
      ready_for_review: [48],
      merged: [46],
    })
  })

  it("formats times in Central", () => {
    expect(formatWorkboardTime("2026-10-17T00:45:00.000Z")).toBe("Oct 16, 7:45 PM CDT")
    expect(formatWorkboardTime("nope")).toBe("nope")
  })
})
