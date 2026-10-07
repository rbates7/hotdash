/**
 * Domain model for the Product Roadmap screen: the list of signed bets, in
 * order. Three columns — Now / Next / Later — and a position within each.
 * A bet can spawn Agent Workplace tickets; tickets never live here.
 */
export type RoadmapColumn = "now" | "next" | "later"

export const COLUMN_ORDER: readonly RoadmapColumn[] = ["now", "next", "later"]

export const COLUMN_CONFIG: Record<
  RoadmapColumn,
  { label: string; description: string }
> = {
  now: {
    label: "Now",
    description: "Signed and being built. The crew is on it.",
  },
  next: {
    label: "Next",
    description: "Signed; starts when something in Now ships.",
  },
  later: {
    label: "Later",
    description: "A bet we mean to make, not yet sequenced.",
  },
}

export function isColumn(value: unknown): value is RoadmapColumn {
  return (
    typeof value === "string" &&
    (COLUMN_ORDER as readonly string[]).includes(value)
  )
}

/** The product lane is Rashad's and Mace's. */
export type RoadmapOwner = "Rashad" | "Mace"

export const OWNERS: readonly RoadmapOwner[] = ["Rashad", "Mace"]

export const DEFAULT_OWNER: RoadmapOwner = "Rashad"

export function isOwner(value: unknown): value is RoadmapOwner {
  return typeof value === "string" && (OWNERS as readonly string[]).includes(value)
}

/** Caps enforced on the inputs and again when a saved copy is read back. */
export const MAX_TITLE = 80
export const MAX_WHY = 160
export const MAX_WINDOW = 24

export type RoadmapItem = {
  /** `rm-<n>`; `n` is handed out by the store's counter. */
  id: string
  title: string
  /** One line: why this bet matters. */
  why: string
  owner: RoadmapOwner
  /** Target window as plain text: "Q4 2026", "Nov 2026", "2027". */
  window: string
  column: RoadmapColumn
  /** Position within the column; lower is higher on the board. */
  order: number
  /** Linked Agent Workplace tickets. Sample count, display only — nothing is wired. */
  linkedTickets: number
  /** True when the bet came in through the Feature Request intake. */
  fromFeatureRequest?: true
  /**
   * True for the invented examples shipped with the page. Cleared the moment
   * the words (title, why, window) are rewritten, because then they are the
   * founder's, not ours. Moving or re-owning a bet keeps the tag.
   */
  sample?: true
  /** When the bet was signed. ISO instant. */
  signedAt: string
  updatedAt: string
}

export type RoadmapState = {
  items: RoadmapItem[]
  /** Next number for a generated `rm-n` id. Always above every id in use. */
  nextId: number
}

/* --------------------------------------------------------------- ordering */

/** Items in `column`, top to bottom. Ties on `order` fall back to id so the order is total. */
export function inColumn(items: readonly RoadmapItem[], column: RoadmapColumn): RoadmapItem[] {
  return items
    .filter((i) => i.column === column)
    .sort((a, b) => a.order - b.order || idNumber(a.id) - idNumber(b.id))
}

/** Re-numbers `column` 0..n-1 in display order, leaving other columns alone. */
export function normalizeColumn(items: readonly RoadmapItem[], column: RoadmapColumn): RoadmapItem[] {
  const ordered = inColumn(items, column)
  const position = new Map(ordered.map((item, index) => [item.id, index]))
  return items.map((item) => {
    const index = position.get(item.id)
    return index === undefined || item.order === index ? item : { ...item, order: index }
  })
}

/* ------------------------------------------------------------- validation */

const ID_PATTERN = /^rm-(\d+)$/

/** The numeric part of an `rm-n` id, or -1 when the id is not in that form. */
export function idNumber(id: string): number {
  const match = ID_PATTERN.exec(id)
  return match ? Number(match[1]) : -1
}

/** Strict ISO instant: parses, and prints back to exactly the same string. */
export function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString() === value
}

function isText(value: unknown, max: number, { required }: { required: boolean }): value is string {
  if (typeof value !== "string" || value.length > max) return false
  return required ? value.trim().length > 0 : true
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

/**
 * One saved bet, checked field by field. Returns a fresh object holding only
 * the known fields, so anything extra that found its way into the saved copy
 * is dropped rather than carried along. `null` when any field is off.
 */
export function parseItem(value: unknown): RoadmapItem | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== "string" || idNumber(v.id) < 0) return null
  if (!isText(v.title, MAX_TITLE, { required: true })) return null
  if (!isText(v.why, MAX_WHY, { required: false })) return null
  if (!isOwner(v.owner)) return null
  if (!isText(v.window, MAX_WINDOW, { required: false })) return null
  if (!isColumn(v.column)) return null
  if (!isCount(v.order)) return null
  if (!isCount(v.linkedTickets)) return null
  if (v.fromFeatureRequest !== undefined && v.fromFeatureRequest !== true) return null
  if (v.sample !== undefined && v.sample !== true) return null
  if (!isIsoInstant(v.signedAt) || !isIsoInstant(v.updatedAt)) return null

  const item: RoadmapItem = {
    id: v.id,
    title: v.title,
    why: v.why,
    owner: v.owner,
    window: v.window,
    column: v.column,
    order: v.order,
    linkedTickets: v.linkedTickets,
    signedAt: v.signedAt,
    updatedAt: v.updatedAt,
  }
  if (v.fromFeatureRequest === true) item.fromFeatureRequest = true
  if (v.sample === true) item.sample = true
  return item
}

/**
 * A whole saved copy. One bad item, a duplicate id, or a counter that could
 * hand out an id already in use, and the whole copy is refused (`null`) —
 * the caller then shows the seed instead of half of someone's roadmap.
 */
export function parseState(value: unknown): RoadmapState | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.items)) return null
  if (!Number.isInteger(v.nextId) || (v.nextId as number) < 1) return null

  const items: RoadmapItem[] = []
  const ids = new Set<string>()
  let maxId = 0
  for (const raw of v.items) {
    const item = parseItem(raw)
    if (!item || ids.has(item.id)) return null
    ids.add(item.id)
    maxId = Math.max(maxId, idNumber(item.id))
    items.push(item)
  }
  if ((v.nextId as number) <= maxId) return null

  return { items, nextId: v.nextId as number }
}
