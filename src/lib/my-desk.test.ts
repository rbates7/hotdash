import { describe, expect, it } from "vitest"

import { todayIn } from "@/lib/clock"
import {
  DESK_MOCK_DAY,
  SEED_SCRATCH,
  SEED_TODO_IDS,
  TODO_LIMITS,
  describeTodo,
  formatDeskDate,
  isSeedScratch,
  isSeedTodo,
  isTodo,
  normalizeScratch,
  normalizeTodoInput,
  openCount,
  sameTodo,
  seedTodos,
  stripTodo,
  todoNumber,
  type Todo,
} from "@/lib/my-desk"
import { LATE_EVENING_CT } from "@/test/clock"

const seed = seedTodos()
const one = seed[0]

describe("seed", () => {
  it("reproduces the mock: seven rows, five open, two done, in the mock's order", () => {
    expect(seed.map((t) => [t.title, t.note, t.done])).toEqual([
      ["Call Aledo", "HC — Friday walk-through", false],
      ["Clinic follow-up", "Houston staff — one-pager", false],
      ["Look at Metrics", "Overnight signups", false],
      ["Reply to Dan", "Hash-left idea — Feature Request, not here", false],
      ["Text May — Dallas night", "Coaches night seating", true],
      ["Confirm Austin flight", "Sunday return if install holds", true],
      ["Sketch Aledo install notes", "11-personnel packet", false],
    ])
    expect(openCount(seed)).toBe(5)
    expect(seed.every(isTodo)).toBe(true)
    expect([...SEED_TODO_IDS]).toEqual(seed.map((t) => t.id))
    expect(isSeedTodo({ id: "todo-3" })).toBe(true)
    expect(isSeedTodo({ id: "todo-9" })).toBe(false)
    expect(todoNumber("todo-12")).toBe(12)
    expect(todoNumber("item-12")).toBe(0)
  })

  it("the scratch note is the mock's six lines, marked as sample until the founder types", () => {
    expect(SEED_SCRATCH).toContain("Aledo wants the 11-personnel packet")
    expect(SEED_SCRATCH).toContain("Dan’s hash-left idea")
    expect(isSeedScratch(SEED_SCRATCH)).toBe(true)
    expect(isSeedScratch("something else")).toBe(false)
  })
})

describe("formatDeskDate is the mock's chip, from a Central calendar day", () => {
  it("writes Wed 26 Aug on the day the mock was drawn", () => {
    expect(formatDeskDate(DESK_MOCK_DAY)).toBe("Wed 26 Aug")
  })

  it("23:30 CT on 7 Oct is still Wed 7 Oct, even though UTC has moved on", () => {
    expect(todayIn(LATE_EVENING_CT)).toBe("2026-10-07")
    expect(LATE_EVENING_CT.getUTCDate()).toBe(8)
    expect(formatDeskDate(todayIn(LATE_EVENING_CT))).toBe("Wed 7 Oct")
  })
})

describe("guards and normalising", () => {
  it("isTodo rejects a blank title, a bad id, a long note and a non-boolean done", () => {
    expect(isTodo(one)).toBe(true)
    expect(isTodo({ ...one, title: "" })).toBe(false)
    expect(isTodo({ ...one, title: "   " })).toBe(false)
    expect(isTodo({ ...one, id: "item-1" })).toBe(false)
    expect(isTodo({ ...one, note: "x".repeat(TODO_LIMITS.note + 1) })).toBe(false)
    expect(isTodo({ ...one, done: "yes" })).toBe(false)
    expect(isTodo({ ...one, title: "x".repeat(TODO_LIMITS.title + 1) })).toBe(false)
  })

  it("stripTodo / normalize drop extras and clamp; sameTodo is field-by-field", () => {
    const dirty = { ...one, extra: true } as Todo & { extra: boolean }
    const clean = stripTodo(dirty)
    expect(Object.keys(clean)).toEqual(["id", "title", "note", "done"])
    expect(normalizeTodoInput({ title: "  Call  ", note: "  note  ", done: false })).toEqual({
      title: "Call",
      note: "note",
      done: false,
    })
    expect(normalizeScratch("x".repeat(TODO_LIMITS.scratch + 10))).toHaveLength(TODO_LIMITS.scratch)
    expect(sameTodo(one, { ...one })).toBe(true)
    expect(sameTodo(one, { ...one, done: true })).toBe(false)
    expect(describeTodo(one)).toBe("Call Aledo — HC — Friday walk-through")
    expect(describeTodo({ title: "Just a title", note: "" })).toBe("Just a title")
  })
})
