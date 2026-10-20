import { describe, expect, it } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { crmFixtureCases } from "@/test/crm-fixture"
import {
  LOCAL_EDITS_KEY,
  adjustCounts,
  applyEdit,
  loadLocalEdits,
  localEditsStorage,
  mergeCase,
  mergeCases,
  parseLocalEdits,
} from "@/lib/crm/local-edits"
import { isOpenCrmCase, isWaitingOnUs, type CrmCase, type CrmCounts } from "@/lib/crm/case-view"

/** The server's counting rules (docs/crm-gmail-data.md), over rows. */
function countCases(cases: readonly CrmCase[], closedThisWeek: number): CrmCounts {
  return {
    open: cases.filter(isOpenCrmCase).length,
    waitingOnUs: cases.filter(isWaitingOnUs).length,
    waitingOnThem: cases.filter((c) => c.status === "waiting_on_them").length,
    closedThisWeek,
  }
}

const AT = new Date(FIXED_NOW_MS).toISOString()
const [urgent, overdue, waiting, closed] = crmFixtureCases(FIXED_NOW_MS)

describe("applyEdit / mergeCase", () => {
  it("records the change and the live value it replaced", () => {
    const edits = applyEdit({}, overdue!, { status: "closed" }, AT)
    expect(edits).toEqual({ [overdue!.id]: { status: { value: "closed", from: "waiting_on_us" }, at: AT } })
    expect(mergeCase(overdue!, edits[overdue!.id]).status).toBe("closed")
  })

  it("keeps status and priority edits side by side", () => {
    let edits = applyEdit({}, overdue!, { status: "waiting_on_them" }, AT)
    edits = applyEdit(edits, overdue!, { priority: "low" }, AT)
    expect(mergeCase(overdue!, edits[overdue!.id])).toMatchObject({ status: "waiting_on_them", priority: "low" })
  })

  it("setting a field back to the live value removes it, and an empty edit goes", () => {
    let edits = applyEdit({}, overdue!, { status: "closed" }, AT)
    edits = applyEdit(edits, overdue!, { status: "waiting_on_us" }, AT)
    expect(edits).toEqual({})
  })

  it("stops applying once the live row moves on by itself", () => {
    const edits = applyEdit({}, overdue!, { status: "closed" }, AT)
    const moved = { ...overdue!, status: "waiting_on_them" as const }
    expect(mergeCase(moved, edits[overdue!.id]).status).toBe("waiting_on_them")
  })

  it("leaves untouched rows as the same objects", () => {
    const live = crmFixtureCases(FIXED_NOW_MS)
    const merged = mergeCases(live, applyEdit({}, overdue!, { priority: "low" }, AT))
    expect(merged[0]).toBe(live[0])
    expect(merged[1]).not.toBe(live[1])
  })
})

describe("parseLocalEdits and storage", () => {
  it("keeps good entries, drops bad ones, strips unknown fields", () => {
    expect(
      parseLocalEdits({
        a: { status: { value: "closed", from: "open" }, at: AT, extra: 1 },
        b: { status: { value: "nope", from: "open" }, at: AT },
        c: { at: AT },
        d: "x",
      })
    ).toEqual({ a: { status: { value: "closed", from: "open" }, at: AT } })
    expect(parseLocalEdits([])).toBeNull()
  })

  it("round-trips through localStorage under its own key", () => {
    const edits = applyEdit({}, waiting!, { priority: "urgent" }, AT)
    expect(localEditsStorage.save(window.localStorage, edits)).toBe(true)
    expect(window.localStorage.getItem(LOCAL_EDITS_KEY)).not.toBeNull()
    expect(loadLocalEdits(window.localStorage)).toEqual(edits)
    window.localStorage.setItem(LOCAL_EDITS_KEY, "{not json")
    expect(loadLocalEdits(window.localStorage)).toEqual({})
  })
})

describe("adjustCounts", () => {
  const live = [urgent!, overdue!, waiting!, closed!]
  const counts = countCases(live, 1)
  const weekStart = FIXED_NOW_MS - 2 * 86_400_000

  it("moves an edited case between buckets", () => {
    const edits = applyEdit({}, overdue!, { status: "waiting_on_them" }, AT)
    expect(adjustCounts(counts, live, edits, weekStart)).toEqual({
      ...counts,
      waitingOnUs: counts.waitingOnUs - 1,
      waitingOnThem: counts.waitingOnThem + 1,
    })
  })

  it("closing here counts toward Closed this week", () => {
    const edits = applyEdit({}, urgent!, { status: "closed" }, AT)
    expect(adjustCounts(counts, live, edits, weekStart)).toEqual({
      open: counts.open - 1,
      waitingOnUs: counts.waitingOnUs - 1,
      waitingOnThem: counts.waitingOnThem,
      closedThisWeek: counts.closedThisWeek + 1,
    })
  })

  it("matches counting the merged rows directly", () => {
    let edits = applyEdit({}, closed!, { status: "open" }, AT)
    edits = applyEdit(edits, waiting!, { status: "waiting_on_us" }, AT)
    const direct = countCases(mergeCases(live, edits), counts.closedThisWeek)
    expect(adjustCounts(counts, live, edits, weekStart)).toEqual(direct)
  })
})
