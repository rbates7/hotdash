import { isIsoInstant } from "@/lib/persistence"
import { MAX_TITLE, MAX_WHY, MAX_WINDOW, isColumn, type BoardItem } from "@/lib/roadmap/roadmap"

/**
 * What `/api/notion/roadmap` returns, shared by the route and the browser.
 * No token, no page id, no error text: only the mapped roadmap rows and
 * when they were read.
 *
 * - `connected`     — the last sync succeeded within the cache window.
 * - `stale`         — Notion could not be read (down, token revoked, page
 *                     unshared); these are the last good rows, as of
 *                     `lastSyncedAt`.
 * - `not_connected` — no token or page id, or Notion has never answered:
 *                     no rows. The Roadmap shows its labelled sample.
 */
export type NotionRoadmapStatus = "connected" | "stale" | "not_connected"

/** Longest owner name a card shows (Notion people and select names). */
export const MAX_OWNER = 40

/**
 * One Notion row on the board. Only the mapped fields: nothing else from
 * the page (no page id, URL, body, comments or other properties) leaves
 * the server.
 */
export type LiveRoadmapItem = Omit<BoardItem, "sample" | "linkedTickets"> & {
  /** When the bet was signed (the Signed date, else when the row was created). ISO instant. */
  signedAt: string
  /** When the row was last edited in Notion. ISO instant. */
  updatedAt: string
}

export type LiveRoadmap = {
  /** Every placed row, ordered within its column (`order` 0..n-1). */
  items: LiveRoadmapItem[]
  /**
   * Rows that are not done but whose status is missing or not one the board
   * knows (see docs/notion-roadmap.md). Counted, never guessed into a column.
   */
  unplaced: number
}

export type NotionRoadmapSummary =
  | { status: "connected" | "stale"; lastSyncedAt: string; roadmap: LiveRoadmap }
  | { status: "not_connected"; lastSyncedAt: null; roadmap: null }

export const NOTION_NOT_CONNECTED: NotionRoadmapSummary = {
  status: "not_connected",
  lastSyncedAt: null,
  roadmap: null,
}

/** `/api/health/notion`: a status word, nothing else. */
export type NotionHealth = "ok" | "unavailable" | "not_configured"

export const NOTION_ROADMAP_PATH = "/api/notion/roadmap"
export const NOTION_HEALTH_PATH = "/api/health/notion"

const isText = (v: unknown, max: number) => typeof v === "string" && v.length <= max

function parseLiveItem(value: unknown): LiveRoadmapItem | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== "string" || !/^notion-\d+$/.test(v.id)) return null
  if (!isText(v.title, MAX_TITLE) || !(v.title as string).trim()) return null
  if (!isText(v.why, MAX_WHY) || !isText(v.window, MAX_WINDOW)) return null
  if (v.owner !== null && !(isText(v.owner, MAX_OWNER) && (v.owner as string).trim())) return null
  if (!isColumn(v.column)) return null
  if (!Number.isInteger(v.order) || (v.order as number) < 0) return null
  if (v.fromFeatureRequest !== undefined && v.fromFeatureRequest !== true) return null
  if (!isIsoInstant(v.signedAt) || !isIsoInstant(v.updatedAt)) return null
  const item: LiveRoadmapItem = {
    id: v.id,
    title: v.title as string,
    why: v.why as string,
    owner: v.owner as string | null,
    window: v.window as string,
    column: v.column,
    order: v.order as number,
    signedAt: v.signedAt,
    updatedAt: v.updatedAt,
  }
  if (v.fromFeatureRequest === true) item.fromFeatureRequest = true
  return item
}

/**
 * A response body read back defensively: anything that is not a complete
 * summary is null, and the caller treats it like an unreachable endpoint.
 * Unknown keys are dropped.
 */
export function parseNotionRoadmapSummary(value: unknown): NotionRoadmapSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return NOTION_NOT_CONNECTED
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.lastSyncedAt !== "string" || !Number.isFinite(Date.parse(v.lastSyncedAt))) return null
  const r = v.roadmap as Record<string, unknown> | null
  if (!r || typeof r !== "object" || !Array.isArray(r.items)) return null
  if (!Number.isInteger(r.unplaced) || (r.unplaced as number) < 0) return null
  const items: LiveRoadmapItem[] = []
  const ids = new Set<string>()
  for (const raw of r.items) {
    const item = parseLiveItem(raw)
    if (!item || ids.has(item.id)) return null
    ids.add(item.id)
    items.push(item)
  }
  return { status: v.status, lastSyncedAt: v.lastSyncedAt, roadmap: { items, unplaced: r.unplaced as number } }
}

/* ---------------------------------------------------------- in the browser */

/** The browser's copy: loading until `/api/notion/roadmap` first answers. */
export type NotionRoadmapView = { phase: "loading" } | { phase: "ready"; summary: NotionRoadmapSummary }

/**
 * What the Roadmap shows:
 * - `loading` — the board skeleton;
 * - `sample`  — Notion is not connected: the local board (labelled sample
 *               bets plus this browser's edits), exactly as before;
 * - `live`    — Notion's rows, read-only, no Sample label; `stale` adds
 *               "Last updated …".
 */
export type NotionRoadmapFeed =
  | { kind: "loading" }
  | { kind: "sample" }
  | { kind: "live"; stale: boolean; lastSyncedAt: Date; roadmap: LiveRoadmap }

export function notionFeedOf(view: NotionRoadmapView): NotionRoadmapFeed {
  if (view.phase === "loading") return { kind: "loading" }
  const { summary } = view
  if (summary.status === "not_connected") return { kind: "sample" }
  return {
    kind: "live",
    stale: summary.status === "stale",
    lastSyncedAt: new Date(summary.lastSyncedAt),
    roadmap: summary.roadmap,
  }
}
