/**
 * Notion API shapes for tests: rows as a data-source query returns them,
 * built from a few plain fields. Invented content; no real workspace.
 */
import type { LiveRoadmap, NotionRoadmapSummary } from "@/lib/notion-roadmap"

type RowInput = {
  title?: string
  status?: string | null
  /** The property type the status comes in. */
  statusType?: "status" | "select"
  why?: string
  owners?: string[]
  window?: string
  due?: { start: string; end?: string | null }
  order?: number
  tags?: string[]
  signed?: string
  created?: string
  edited?: string
  inTrash?: boolean
  /** Extra raw properties (merged last). */
  extra?: Record<string, unknown>
}

const text = (s: string) => [{ type: "text", plain_text: s, text: { content: s } }]

let seq = 0

export function notionRow(input: RowInput): Record<string, unknown> {
  seq += 1
  const properties: Record<string, unknown> = {
    Name: { id: "title", type: "title", title: input.title === undefined ? text(`Bet ${seq}`) : text(input.title) },
  }
  if (input.status !== undefined) {
    const type = input.statusType ?? "status"
    properties.Status = { id: "s", type, [type]: input.status === null ? null : { id: "o", name: input.status, color: "blue" } }
  }
  if (input.why !== undefined) properties.Why = { id: "w", type: "rich_text", rich_text: text(input.why) }
  if (input.owners) {
    properties.Owner = {
      id: "p",
      type: "people",
      people: input.owners.map((name, i) => ({ object: "user", id: `u-${i}`, name, avatar_url: null, person: { email: `${i}@example.com` } })),
    }
  }
  if (input.window !== undefined) properties.Window = { id: "q", type: "select", select: { name: input.window } }
  if (input.due) properties["Target date"] = { id: "d", type: "date", date: { start: input.due.start, end: input.due.end ?? null, time_zone: null } }
  if (input.order !== undefined) properties.Order = { id: "n", type: "number", number: input.order }
  if (input.tags) properties.Tags = { id: "t", type: "multi_select", multi_select: input.tags.map((name) => ({ name })) }
  if (input.signed) properties.Signed = { id: "g", type: "date", date: { start: input.signed, end: null } }
  Object.assign(properties, input.extra)
  return {
    object: "page",
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    created_time: input.created ?? "2026-09-01T15:00:00.000Z",
    last_edited_time: input.edited ?? "2026-10-10T15:00:00.000Z",
    in_trash: input.inTrash ?? false,
    archived: input.inTrash ?? false,
    url: `https://www.notion.so/Bet-${seq}`,
    public_url: null,
    icon: null,
    cover: null,
    properties,
  }
}

/** A small live roadmap as the route returns it (for UI and e2e mocks). */
export const LIVE_ROADMAP: LiveRoadmap = {
  items: [
    { id: "notion-1", title: "Coach onboarding v2", why: "First-week coaches who build a play stay. Get them there in one sitting.", owner: "Rashad", window: "Q4 2026", column: "now", order: 0, signedAt: "2026-09-02T18:00:00.000Z", updatedAt: "2026-10-12T15:04:00.000Z" },
    { id: "notion-2", title: "Shared playbooks", why: "Staff who share one book renew together.", owner: "Mace", window: "Nov 2026", column: "now", order: 1, fromFeatureRequest: true, signedAt: "2026-09-20T18:00:00.000Z", updatedAt: "2026-10-11T15:04:00.000Z" },
    { id: "notion-3", title: "Season recap export", why: "", owner: null, window: "Jan – Feb 2027", column: "next", order: 0, signedAt: "2026-10-01T18:00:00.000Z", updatedAt: "2026-10-09T15:04:00.000Z" },
    { id: "notion-4", title: "Android tablet app", why: "A third of clinic coaches are on Android tablets.", owner: "Priya Natarajan +1", window: "2027", column: "later", order: 0, signedAt: "2026-10-05T18:00:00.000Z", updatedAt: "2026-10-05T18:00:00.000Z" },
  ],
  unplaced: 0,
}

export const NOTION_SYNCED_AT = "2026-10-14T14:41:00.000Z"

export function liveRoadmapSummary(
  status: "connected" | "stale" = "connected",
  roadmap: LiveRoadmap = LIVE_ROADMAP,
  lastSyncedAt = NOTION_SYNCED_AT
): NotionRoadmapSummary {
  return { status, lastSyncedAt, roadmap }
}
