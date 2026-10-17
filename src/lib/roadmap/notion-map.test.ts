import { describe, expect, it } from "vitest"

import { parseNotionRoadmapSummary, NOTION_NOT_CONNECTED } from "@/lib/notion-roadmap"
import { clip, mapNotionRows, readColumn, windowFromDate } from "@/lib/roadmap/notion-map"
import { MAX_TITLE, MAX_WHY, inColumn } from "@/lib/roadmap/roadmap"
import { LIVE_ROADMAP, liveRoadmapSummary, notionRow } from "@/test/notion-fixture"

describe("readColumn", () => {
  it("places Now / Next / Later and the common status words", () => {
    expect(readColumn("Now")).toEqual({ kind: "column", column: "now" })
    expect(readColumn("In progress")).toEqual({ kind: "column", column: "now" })
    expect(readColumn("🚧 Building")).toEqual({ kind: "column", column: "now" })
    expect(readColumn("Up next")).toEqual({ kind: "column", column: "next" })
    expect(readColumn("Not started")).toEqual({ kind: "column", column: "next" })
    expect(readColumn("later")).toEqual({ kind: "column", column: "later" })
    expect(readColumn("Backlog")).toEqual({ kind: "column", column: "later" })
  })

  it("done words are off the board; anything else is unknown, never guessed", () => {
    expect(readColumn("Done")).toEqual({ kind: "done" })
    expect(readColumn("Shipped ✅")).toEqual({ kind: "done" })
    expect(readColumn("Won't do")).toEqual({ kind: "done" })
    expect(readColumn("Blocked")).toEqual({ kind: "unknown" })
    expect(readColumn("")).toEqual({ kind: "unknown" })
    expect(readColumn(null)).toEqual({ kind: "unknown" })
  })
})

describe("windowFromDate", () => {
  it("reads the month off the string, with no time-zone shift", () => {
    expect(windowFromDate("2026-11-01", null)).toBe("Nov 2026")
    expect(windowFromDate("2026-12-01T00:30:00.000-06:00", null)).toBe("Dec 2026")
    expect(windowFromDate("2026-11-03", "2026-11-28")).toBe("Nov 2026")
    expect(windowFromDate("2026-11-03", "2026-12-20")).toBe("Nov – Dec 2026")
    expect(windowFromDate("2026-12-03", "2027-01-20")).toBe("Dec 2026 – Jan 2027")
    expect(windowFromDate(null, null)).toBeNull()
    expect(windowFromDate("soon", null)).toBeNull()
  })
})

describe("mapNotionRows", () => {
  it("maps title, why, owner, window, column, signed and edited dates — and nothing else", () => {
    const { items, unplaced } = mapNotionRows([
      notionRow({
        title: "Coach onboarding v2",
        status: "In progress",
        why: "First week matters.",
        owners: ["Rashad Bates"],
        window: "Q4 2026",
        signed: "2026-09-02",
        edited: "2026-10-12T15:04:00.000Z",
      }),
    ])
    expect(unplaced).toBe(0)
    expect(items).toEqual([
      {
        id: "notion-1",
        title: "Coach onboarding v2",
        why: "First week matters.",
        owner: "Rashad Bates",
        window: "Q4 2026",
        column: "now",
        order: 0,
        signedAt: "2026-09-02T18:00:00.000Z",
        updatedAt: "2026-10-12T15:04:00.000Z",
      },
    ])
    // No page id, URL, email or other property leaves the mapping.
    const json = JSON.stringify(items)
    for (const leak of ["notion.so", "example.com", "00000000-", "avatar"]) expect(json).not.toContain(leak)
  })

  it("falls back honestly: Untitled, no why, no owner, no window, created time as signed", () => {
    const { items } = mapNotionRows([notionRow({ title: "  ", status: "Next", created: "2026-08-01T10:00:00.000Z" })])
    expect(items[0]).toMatchObject({ title: "Untitled", why: "", owner: null, window: "", column: "next", signedAt: "2026-08-01T10:00:00.000Z" })
  })

  it("reads a select status, a date window, two owners, and a Feature Request tag", () => {
    const { items } = mapNotionRows([
      notionRow({
        status: "Later",
        statusType: "select",
        due: { start: "2026-12-01", end: "2027-01-31" },
        owners: ["Priya Natarajan", "Mace"],
        tags: ["Growth", "Feature request"],
      }),
    ])
    expect(items[0]).toMatchObject({ column: "later", window: "Dec 2026 – Jan 2027", owner: "Priya Natarajan +1", fromFeatureRequest: true })
  })

  it("prefers a Now/Next/Later column over a workflow Status when a row has both", () => {
    const row = notionRow({ status: "In review", extra: { Horizon: { type: "select", select: { name: "Next" } } } })
    expect(mapNotionRows([row]).items[0].column).toBe("next")
  })

  it("matches property names whatever their case and spacing, and reads text and formula values", () => {
    const row = notionRow({
      extra: {
        " status ": { type: "rich_text", rich_text: [{ plain_text: "now" }] },
        "WHY IT MATTERS": { type: "formula", formula: { type: "string", string: "Because." } },
        lead: { type: "select", select: { name: "Mace" } },
      },
    })
    expect(mapNotionRows([row]).items[0]).toMatchObject({ column: "now", why: "Because.", owner: "Mace" })
  })

  it("leaves done and trashed rows off, and counts rows it cannot place", () => {
    const result = mapNotionRows([
      notionRow({ status: "Now" }),
      notionRow({ status: "Shipped" }),
      notionRow({ status: "Now", inTrash: true }),
      notionRow({ status: "Blocked" }),
      notionRow({}),
      notionRow({ status: null }),
      { object: "database" },
      null,
    ])
    expect(result.items).toHaveLength(1)
    expect(result.unplaced).toBe(3)
  })

  it("orders by the Order number (rows without one after), then Notion's order; order is 0..n-1 per column", () => {
    const { items } = mapNotionRows([
      notionRow({ title: "A", status: "Now" }),
      notionRow({ title: "B", status: "Now", order: 2 }),
      notionRow({ title: "C", status: "Next" }),
      notionRow({ title: "D", status: "Now", order: 1 }),
      notionRow({ title: "E", status: "Now" }),
    ])
    expect(inColumn(items, "now").map((i) => [i.title, i.order])).toEqual([["D", 0], ["B", 1], ["A", 2], ["E", 3]])
    expect(inColumn(items, "next").map((i) => [i.title, i.order])).toEqual([["C", 0]])
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it("clips long text with an ellipsis to the board's caps", () => {
    const { items } = mapNotionRows([notionRow({ title: "t".repeat(200), why: "w".repeat(400), status: "Now" })])
    expect(items[0].title).toHaveLength(MAX_TITLE)
    expect(items[0].title.endsWith("…")).toBe(true)
    expect(items[0].why).toHaveLength(MAX_WHY)
    expect(clip("short", 10)).toBe("short")
  })

  it("its output reads back through the browser's parser unchanged", () => {
    const roadmap = mapNotionRows([notionRow({ status: "Now", owners: ["A"], tags: ["Feature Request"] }), notionRow({ status: "Blocked" })])
    expect(parseNotionRoadmapSummary(liveRoadmapSummary("connected", roadmap))).toEqual(liveRoadmapSummary("connected", roadmap))
  })
})

describe("parseNotionRoadmapSummary", () => {
  it("reads not_connected, connected and stale; drops unknown keys", () => {
    expect(parseNotionRoadmapSummary({ status: "not_connected", extra: 1 })).toEqual(NOTION_NOT_CONNECTED)
    expect(parseNotionRoadmapSummary(liveRoadmapSummary("stale"))).toEqual(liveRoadmapSummary("stale"))
    const withExtra = { ...liveRoadmapSummary(), roadmap: { ...LIVE_ROADMAP, items: [{ ...LIVE_ROADMAP.items[0], url: "x" }] } }
    expect(parseNotionRoadmapSummary(withExtra)?.roadmap?.items[0]).not.toHaveProperty("url")
  })

  it("refuses anything incomplete or off", () => {
    const good = liveRoadmapSummary()
    const item = LIVE_ROADMAP.items[0]
    const bad = [
      null,
      "connected",
      { status: "error" },
      { ...good, lastSyncedAt: "yesterday" },
      { ...good, roadmap: null },
      { ...good, roadmap: { items: [], unplaced: -1 } },
      { ...good, roadmap: { items: [{ ...item, column: "done" }], unplaced: 0 } },
      { ...good, roadmap: { items: [{ ...item, title: "" }], unplaced: 0 } },
      { ...good, roadmap: { items: [{ ...item, owner: "" }], unplaced: 0 } },
      { ...good, roadmap: { items: [{ ...item, id: "rm-1" }], unplaced: 0 } },
      { ...good, roadmap: { items: [item, item], unplaced: 0 } },
    ]
    for (const value of bad) expect(parseNotionRoadmapSummary(value)).toBeNull()
  })
})


describe("CHLK Product Roadmap schema (recorded fixture rows, tests only)", () => {
  const sel = (name: string | null) => ({ type: "select", select: name ? { name } : null })
  const txt = (t: string) => ({ type: "rich_text", rich_text: t ? [{ plain_text: t }] : [] })
  const row = (props: Record<string, unknown>) => ({
    object: "page", created_time: "2026-03-01T12:00:00.000Z", last_edited_time: "2026-03-02T12:00:00.000Z",
    properties: { Name: { type: "title", title: [{ plain_text: String(props.name ?? "") }] }, ...(props.p as object) },
  })
  it("places by Priority (Now/Next/Later), drops Status Done, reads Feature Description and Timeline", () => {
    const out = mapNotionRows([
      row({ name: "Shareable Plays", p: { Priority: sel("Now"), Status: sel("Development"),
        "Feature Description": txt("Share plays in-app."), Timeline: { type: "multi_select", multi_select: [{ name: "Q1 S1" }] } } }),
      row({ name: "Churn doc", p: { Priority: sel("Now"), Status: sel("Done") } }),
      row({ name: "Later thing", p: { Priority: sel("Later"), Status: sel("Backlog"),
        "Public Release": { type: "date", date: { start: "2026-11-03", end: null } } } }),
      row({ name: "", p: { Priority: sel(null), Status: sel(null) } }),
    ])
    expect(out.items.map((i) => [i.title, i.column, i.window])).toEqual([
      ["Shareable Plays", "now", "Q1 S1"],
      ["Later thing", "later", "Nov 2026"],
    ])
    expect(out.items[0].why).toBe("Share plays in-app.")
    expect(out.items[0].owner).toBeNull()
    expect(out.unplaced).toBe(1)
  })
})
