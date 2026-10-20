import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { payingOnFailure, usePayingCoaches } from "@/hooks/use-paying-coaches"

const LIVE = { status: "connected" as const, counts: { appStore: 1, stripe: 2, invoice: 3, other: 0, total: 6 }, asOf: "2026-10-19T20:00:00.000Z" }

describe("usePayingCoaches", () => {
  it("starts loading (null), then shows the answer", async () => {
    const { result } = renderHook(() => usePayingCoaches(async () => LIVE))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual(LIVE))
  })
  it("an unreachable endpoint with nothing yet is not connected", async () => {
    const fail = async () => {
      throw new Error("down")
    }
    const { result } = renderHook(() => usePayingCoaches(fail))
    await waitFor(() => expect(result.current).toEqual({ status: "not_connected" }))
  })
  it("keeps the last counts as stale on failure", () => {
    expect(payingOnFailure(LIVE)).toEqual({ ...LIVE, status: "stale" })
    expect(payingOnFailure({ status: "connecting" })).toEqual({ status: "not_connected" })
    expect(payingOnFailure(null)).toEqual({ status: "not_connected" })
  })
})
