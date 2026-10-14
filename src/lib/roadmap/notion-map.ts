/**
 * Notion database rows → the Roadmap's own shape (`LiveRoadmapItem`).
 * Pure: no fetch, no clock. The server module (`@/lib/server/notion`)
 * hands it the raw rows of a query and keeps only what this returns, so
 * nothing outside these fields is held or sent on.
 *
 * Properties are found by name (case- and spacing-insensitive, first match
 * wins), with the property *type* deciding how the value is read. The full
 * table is in docs/notion-roadmap.md; in short:
 *
 * | Board field   | Notion property (first that exists)                        |
 * | ------------- | ---------------------------------------------------------- |
 * | title         | the database's title property                              |
 * | column        | Column, Roadmap, Horizon, Stage, Phase, Status              |
 * | why           | Why, Why it matters, Summary, Description, Problem, Notes  |
 * | owner         | Owner, Owners, DRI, Lead, Assignee, Assignees, Assigned to |
 * | window        | Window, Target window, Target, Quarter, Timeline, Timeframe, When, Release, Target date, Due date, Due, ETA, Launch date, Date |
 * | order         | Order, Rank, Position, Sort (a number; else Notion's order) |
 * | signedAt      | Signed, Signed on, Signed at, Committed on (else created)  |
 * | from Feature Request | Source, Origin, From, Tags, Labels, Type (any value naming "feature request"), or a "From Feature Request" checkbox |
 *
 * A status the board does not know is never guessed into a column: done /
 * shipped / cancelled rows are left off (they are not bets any more), and
 * anything else unrecognised — or no status at all — is counted in
 * `unplaced` so the page can say so.
 */
import type { LiveRoadmap, LiveRoadmapItem } from "@/lib/notion-roadmap"
import { MAX_OWNER } from "@/lib/notion-roadmap"
import { middayInstant } from "@/lib/roadmap/dates"
import { MAX_TITLE, MAX_WHY, MAX_WINDOW, type RoadmapColumn } from "@/lib/roadmap/roadmap"

/* ----------------------------------------------------------- property names */

export const PROPERTY_NAMES = {
  column: ["Column", "Roadmap", "Horizon", "Stage", "Phase", "Status"],
  why: ["Why", "Why it matters", "Summary", "Description", "Problem", "Notes"],
  owner: ["Owner", "Owners", "DRI", "Lead", "Assignee", "Assignees", "Assigned to"],
  window: [
    "Window", "Target window", "Target", "Quarter", "Timeline", "Timeframe", "When", "Release",
    "Target date", "Due date", "Due", "ETA", "Launch date", "Date",
  ],
  order: ["Order", "Rank", "Position", "Sort"],
  signedAt: ["Signed", "Signed on", "Signed at", "Committed on"],
  source: ["Source", "Origin", "From", "Tags", "Labels", "Type"],
  fromFeatureRequestCheckbox: ["From Feature Request", "Feature request"],
} as const

/* ------------------------------------------------------------ status words */

const COLUMN_WORDS: Record<RoadmapColumn, readonly string[]> = {
  now: ["now", "in progress", "doing", "building", "in development", "in dev", "active", "current", "started", "this quarter"],
  next: ["next", "up next", "planned", "to do", "todo", "ready", "not started", "queued", "committed", "next quarter"],
  later: ["later", "backlog", "someday", "future", "icebox", "ideas", "idea", "exploring", "parked", "maybe"],
}

/** Off the board on purpose: no longer a bet in front of the team. */
const DONE_WORDS = [
  "done", "shipped", "complete", "completed", "launched", "released", "live",
  "cancelled", "canceled", "archived", "won't do", "wont do", "dropped", "abandoned",
]

/** Lower case, emoji and punctuation (bar the apostrophe) stripped, spaces collapsed. */
function normal(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export type ColumnReading = { kind: "column"; column: RoadmapColumn } | { kind: "done" } | { kind: "unknown" }

/** A status value → a board column, off the board (done), or unknown. */
export function readColumn(value: string | null): ColumnReading {
  if (value === null) return { kind: "unknown" }
  const word = normal(value)
  for (const column of ["now", "next", "later"] as const) {
    if (COLUMN_WORDS[column].includes(word)) return { kind: "column", column }
  }
  if (DONE_WORDS.includes(word)) return { kind: "done" }
  return { kind: "unknown" }
}

/* ------------------------------------------------------- property readers */

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === "string" ? v : null)

function find(properties: Json, names: readonly string[]): Json | null {
  const byName = new Map<string, Json>()
  for (const [name, value] of Object.entries(properties)) {
    const prop = obj(value)
    if (prop && !byName.has(normal(name))) byName.set(normal(name), prop)
  }
  for (const name of names) {
    const prop = byName.get(normal(name))
    if (prop) return prop
  }
  return null
}

function richText(value: unknown): string {
  return arr(value)
    .map((part) => str(obj(part)?.plain_text) ?? "")
    .join("")
}

function optionName(value: unknown): string | null {
  const name = str(obj(value)?.name)?.trim()
  return name ? name : null
}

function personName(value: unknown): string | null {
  const name = str(obj(value)?.name)?.trim()
  return name ? name : null
}

/** "2026-11-03" or an instant → [year, month 1-12], read off the string (no zone shift). */
function yearMonth(date: string): [number, number] | null {
  const m = /^(\d{4})-(\d{2})/.exec(date)
  if (!m) return null
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? [Number(m[1]), month] : null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A Notion date (or range) as a window label: "Nov 2026", "Nov – Dec 2026", "Dec 2026 – Jan 2027". */
export function windowFromDate(start: string | null, end: string | null): string | null {
  const a = start ? yearMonth(start) : null
  if (!a) return null
  const b = end ? yearMonth(end) : null
  const label = ([y, m]: [number, number]) => `${MONTHS[m - 1]} ${y}`
  if (!b || (b[0] === a[0] && b[1] === a[1])) return label(a)
  if (b[0] === a[0]) return `${MONTHS[a[1] - 1]} – ${label(b)}`
  return `${label(a)} – ${label(b)}`
}

/** Any property as one line of text: what Notion itself would show in a cell. */
function asText(prop: Json | null): string | null {
  if (!prop) return null
  const type = str(prop.type)
  const value = type ? prop[type] : undefined
  let text: string | null = null
  switch (type) {
    case "title":
    case "rich_text":
      text = richText(value)
      break
    case "select":
    case "status":
      text = optionName(value)
      break
    case "multi_select":
      text = arr(value).map(optionName).filter(Boolean).join(", ")
      break
    case "people":
      text = peopleText(value)
      break
    case "date": {
      const d = obj(value)
      text = windowFromDate(str(d?.start), str(d?.end))
      break
    }
    case "formula": {
      const f = obj(value)
      if (str(f?.type) === "string") text = str(f?.string)
      else if (str(f?.type) === "date") text = windowFromDate(str(obj(f?.date)?.start), str(obj(f?.date)?.end))
      break
    }
    case "number":
      text = typeof value === "number" && Number.isFinite(value) ? String(value) : null
      break
  }
  const line = text?.replace(/\s+/g, " ").trim()
  return line ? line : null
}

/** "Ada Lovelace", or "Ada Lovelace +1" for two people. Unnamed users (no user-info capability) do not count. */
function peopleText(value: unknown): string | null {
  const names = arr(value).map(personName).filter((n): n is string => Boolean(n))
  if (names.length === 0) return null
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

/** Shortened to `max` with an ellipsis, never cut silently. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

function asNumber(prop: Json | null): number | null {
  if (!prop) return null
  const type = str(prop.type)
  const value = type === "formula" ? obj(prop.formula)?.number : type === "number" ? prop.number : undefined
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** A date property's start as an ISO instant; a bare day is midday Central (as the seed dates are). */
function asInstant(prop: Json | null): string | null {
  if (!prop || str(prop.type) !== "date") return null
  return instant(str(obj(prop.date)?.start))
}

function instant(value: string | null): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.isFinite(Date.parse(value)) ? middayInstant(value) : null
  }
  const t = Date.parse(value)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function isFeatureRequest(properties: Json): boolean {
  const box = find(properties, PROPERTY_NAMES.fromFeatureRequestCheckbox)
  if (box && str(box.type) === "checkbox" && box.checkbox === true) return true
  const source = asText(find(properties, PROPERTY_NAMES.source))
  return source !== null && /feature[\s-]*requests?/i.test(source)
}

function titleOf(properties: Json): string {
  for (const value of Object.values(properties)) {
    const prop = obj(value)
    if (prop && str(prop.type) === "title") return asText(prop) ?? ""
  }
  return ""
}

/* -------------------------------------------------------------- mapping */

type Mapped = { item: Omit<LiveRoadmapItem, "id" | "order">; rank: number | null; index: number }

/**
 * Rows (`results` of one or more data-source queries, in Notion's order)
 * → the board. Rows in the trash, done rows, and rows without a usable
 * column are left off; the last of those are counted in `unplaced`.
 */
export function mapNotionRows(rows: readonly unknown[]): LiveRoadmap {
  const mapped: Mapped[] = []
  let unplaced = 0
  rows.forEach((raw, index) => {
    const row = obj(raw)
    if (!row || str(row.object) !== "page") return
    if (row.in_trash === true || row.archived === true) return
    const properties = obj(row.properties) ?? {}

    const reading = readColumn(asText(find(properties, PROPERTY_NAMES.column)))
    if (reading.kind === "done") return
    if (reading.kind === "unknown") {
      unplaced += 1
      return
    }

    const created = instant(str(row.created_time))
    const edited = instant(str(row.last_edited_time)) ?? created
    const signedAt = asInstant(find(properties, PROPERTY_NAMES.signedAt)) ?? created
    if (!signedAt || !edited) {
      unplaced += 1
      return
    }
    const owner = asText(find(properties, PROPERTY_NAMES.owner))
    const item: Mapped["item"] = {
      title: clip(titleOf(properties) || "Untitled", MAX_TITLE),
      why: clip(asText(find(properties, PROPERTY_NAMES.why)) ?? "", MAX_WHY),
      owner: owner ? clip(owner, MAX_OWNER) : null,
      window: clip(asText(find(properties, PROPERTY_NAMES.window)) ?? "", MAX_WINDOW),
      column: reading.column,
      signedAt,
      updatedAt: edited,
    }
    if (isFeatureRequest(properties)) item.fromFeatureRequest = true
    mapped.push({ item, rank: asNumber(find(properties, PROPERTY_NAMES.order)), index })
  })

  // Within a column: by the Order/Rank number (rows without one after), then Notion's order.
  mapped.sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank
    if ((a.rank === null) !== (b.rank === null)) return a.rank === null ? 1 : -1
    return a.index - b.index
  })
  const perColumn: Record<RoadmapColumn, number> = { now: 0, next: 0, later: 0 }
  const items = mapped.map(({ item }, i): LiveRoadmapItem => ({
    ...item,
    id: `notion-${i + 1}`,
    order: perColumn[item.column]++,
  }))
  return { items, unplaced }
}
