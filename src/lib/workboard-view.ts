/**
 * The browser's side of `GET /api/workboard` (#51): validate the answer,
 * fold a failed poll into the last view, and sort rows into the board's
 * columns. Pure, so every rule is unit-tested; the fetch and polling live in
 * `@/hooks/use-workboard`. Never a sample row: no answer is loading, an
 * unreadable or failed first answer is not connected.
 */
import { CENTRAL } from "@/lib/clock"
import type {
  WorkboardCi,
  WorkboardItem,
  WorkboardResponse,
  WorkboardReview,
  WorkboardState,
} from "@/lib/workboard"

export type WorkboardStatus = WorkboardResponse["status"]

/** What the board renders: loading until the first answer, then the server's word. */
export type WorkboardView = { phase: "loading" } | { phase: "ready"; summary: WorkboardResponse }

export const WORKBOARD_LOADING_VIEW: WorkboardView = { phase: "loading" }

/** The board's own not-connected answer (our endpoint unreachable or unreadable). */
export const WORKBOARD_NOT_CONNECTED: WorkboardResponse = {
  status: "not_connected",
  connected: false,
  fetchedAt: "",
  stale: false,
  items: [],
}

export const WORK_COLUMNS: readonly { state: WorkboardState; label: string }[] = [
  { state: "working", label: "Working" },
  { state: "needs_fix", label: "Needs fix" },
  { state: "ready_for_review", label: "Ready for review" },
  { state: "merged", label: "Merged" },
]

const STATUSES = new Set<WorkboardStatus>(["connected", "stale", "connecting", "not_connected"])
const STATES = new Set<WorkboardState>(WORK_COLUMNS.map((c) => c.state))
const CIS = new Set<WorkboardCi>(["passing", "failing", "pending", "none"])
const REVIEWS = new Set<WorkboardReview>(["approved", "changes_requested", "pending", "none"])

const isString = (v: unknown): v is string => typeof v === "string"

function parseItem(raw: unknown): WorkboardItem | null {
  if (!raw || typeof raw !== "object") return null
  const i = raw as Record<string, unknown>
  if (typeof i.number !== "number" || !Number.isFinite(i.number)) return null
  if (!isString(i.title) || !isString(i.url) || !/^https:\/\//.test(i.url)) return null
  if (!STATES.has(i.state as WorkboardState)) return null
  return {
    number: i.number,
    title: i.title,
    url: i.url,
    owner: isString(i.owner) ? i.owner : "",
    state: i.state as WorkboardState,
    ci: CIS.has(i.ci as WorkboardCi) ? (i.ci as WorkboardCi) : "none",
    review: REVIEWS.has(i.review as WorkboardReview) ? (i.review as WorkboardReview) : "none",
    updatedAt: isString(i.updatedAt) ? i.updatedAt : "",
    mergedAt: isString(i.mergedAt) ? i.mergedAt : null,
  }
}

/**
 * A `WorkboardResponse`, or null if the body is not one (an HTML 404 page,
 * junk). `connected`/`stale` are taken from `status`, so the two can never
 * disagree; `connecting` and `not_connected` never carry rows.
 */
export function parseWorkboardResponse(raw: unknown): WorkboardResponse | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const status = r.status as WorkboardStatus
  if (!STATUSES.has(status) || !Array.isArray(r.items)) return null
  const live = status === "connected" || status === "stale"
  return {
    status,
    connected: live,
    stale: status === "stale",
    fetchedAt: isString(r.fetchedAt) ? r.fetchedAt : "",
    items: live ? r.items.map(parseItem).filter((i): i is WorkboardItem => i !== null) : [],
  }
}

export type WorkboardEvent = { type: "summary"; summary: WorkboardResponse } | { type: "failure" }

/**
 * A good answer replaces the view. A failed poll keeps the last rows and
 * marks them stale; with no rows yet (loading, or the server was still
 * connecting) it reads as not connected. Never invents a row.
 */
export function workboardReducer(view: WorkboardView, event: WorkboardEvent): WorkboardView {
  if (event.type === "summary") return { phase: "ready", summary: event.summary }
  if (view.phase === "ready" && view.summary.connected) {
    return { phase: "ready", summary: { ...view.summary, status: "stale", stale: true } }
  }
  if (view.phase === "ready" && view.summary.status === "not_connected") return view
  return { phase: "ready", summary: WORKBOARD_NOT_CONNECTED }
}

/** The four render states the board has (plus loading, shown as connecting). */
export type WorkboardKind = "connecting" | "not_connected" | "empty" | "live"

export function workboardKind(view: WorkboardView): WorkboardKind {
  if (view.phase === "loading" || view.summary.status === "connecting") return "connecting"
  if (view.summary.status === "not_connected") return "not_connected"
  return view.summary.items.length === 0 ? "empty" : "live"
}

const OWNERS: Record<string, string> = {
  simmons: "Simmons",
  hill: "Hill",
  koenig: "Koenig",
  fitz: "Fitz",
  radcliffe: "Radcliffe",
}

/** 'simmons-bot' → 'Simmons'; other logins come back unchanged. */
export function ownerName(login: string): string {
  const key = login.toLowerCase().replace(/[-_]?bot$/, "")
  return OWNERS[key] ?? login
}

export function groupByState(items: readonly WorkboardItem[]): Record<WorkboardState, WorkboardItem[]> {
  const out: Record<WorkboardState, WorkboardItem[]> = { working: [], needs_fix: [], ready_for_review: [], merged: [] }
  for (const item of items) out[item.state].push(item)
  return out
}

/** "Oct 16, 5:10 PM CDT"; an unreadable time comes back as is. */
/** Central time ("Oct 16, 7:45 PM CDT"); a missing or unparseable date is "" (rendered as nothing). */
export function formatWorkboardTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-US", {
    timeZone: CENTRAL,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

/** The stale note, shared by the visible note and the announcement. */
export function staleNoteText(fetchedAt: string): string {
  return `GitHub could not be read just now. Showing the last good copy${fetchedAt ? `, from ${formatWorkboardTime(fetchedAt)}` : ""}.`
}

/**
 * What the board's polite live region says: one line per state, so a screen
 * reader hears the board change (connecting to live, live to stale) without
 * moving focus.
 */
export function workboardAnnouncement(view: WorkboardView): string {
  const kind = workboardKind(view)
  if (kind === "connecting" || view.phase !== "ready") return "Connecting\u2026"
  if (kind === "not_connected") return "Not connected"
  const { summary } = view
  if (summary.stale) return staleNoteText(summary.fetchedAt)
  if (kind === "empty") return "No open pull requests"
  const n = summary.items.length
  const updated = summary.fetchedAt ? ` updated ${formatWorkboardTime(summary.fetchedAt)}` : ""
  return `${n} ${n === 1 ? "PR" : "PRs"}${updated}`
}
