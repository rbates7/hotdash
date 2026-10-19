import type { WorkboardItem } from "@/lib/workboard"
import type { InboxItem } from "@/lib/workplace-fixture"

/**
 * The Inbox and Home's "Needs you" from real sources. Pure: the server
 * hands in what each source returned and gets back rows. Every rule for
 * what needs the founder lives here, so both screens agree.
 *
 * - **GitHub** (rbates7/hotdash, through the workboard): a PR that is
 *   `ready_for_review` needs you; one that `needs_fix` is informational
 *   (the agent on it is fixing it). Drafts, running CI and merged PRs are
 *   not Inbox rows.
 * - **Sentry** (org `chlk`, project `chlk-ios`): unresolved error/fatal
 *   issues. New, regressed or escalating ones need you; others seen in the
 *   last 24 hours are informational.
 * - **Gmail**: a stub, always Not connected. The read-only Gmail source
 *   (#46) feeds the CRM; wiring its threads into the Inbox is a follow-up.
 */

export type InboxSourceId = "github" | "sentry" | "gmail"
export const INBOX_SOURCES: readonly InboxSourceId[] = ["github", "sentry", "gmail"]

export type InboxSourceStatus = "connecting" | "connected" | "stale" | "not_connected"

export const SOURCE_LABEL: Record<InboxSourceId, string> = {
  github: "GitHub",
  sentry: "Sentry",
  gmail: "Gmail",
}

/** An Inbox row with where it came from. `unread` is "needs you". */
export type RealInboxItem = InboxItem & {
  source: InboxSourceId
  /** Opens the PR, the Sentry issue or (later) the thread. */
  url: string
}

export type InboxSourceState = { status: InboxSourceStatus; fetchedAt: string | null }

/** What `GET /api/inbox` returns. No token, no error text. */
export type InboxResponse = {
  fetchedAt: string
  sources: Record<InboxSourceId, InboxSourceState>
  /** Newest first. */
  items: RealInboxItem[]
}

export const INBOX_PATH = "/api/inbox"

/* ----------------------------------------------------------------- github */

function fixReason(item: WorkboardItem) {
  if (item.ci === "failing") return "CI failing"
  if (item.review === "changes_requested") return "Changes requested"
  return "Merge conflict"
}

export function fromWorkboard(items: readonly WorkboardItem[]): RealInboxItem[] {
  const out: RealInboxItem[] = []
  for (const pr of items) {
    if (pr.state !== "ready_for_review" && pr.state !== "needs_fix") continue
    const ready = pr.state === "ready_for_review"
    out.push({
      id: `github-pr-${pr.number}`,
      source: "github",
      title: ready ? "PR ready for review" : `PR needs a fix · ${fixReason(pr)}`,
      snippet: `#${pr.number} ${pr.title}`,
      at: pr.updatedAt,
      unread: ready,
      url: pr.url,
    })
  }
  return out
}

/* ----------------------------------------------------------------- sentry */

/** The fields read from `GET /api/0/projects/{org}/{project}/issues/`. */
export type SentryIssue = {
  id: string
  shortId: string
  title: string
  culprit?: string | null
  permalink: string
  level: string
  status: string
  substatus?: string | null
  /** Sentry sends counts as strings. */
  count: string | number
  userCount: number
  firstSeen: string
  lastSeen: string
}

export const SENTRY_ORG = "chlk"
export const SENTRY_PROJECT = "chlk-ios"
const SENTRY_URL = /^https:\/\/(?:[a-z0-9-]+\.)?sentry\.io\//
const NEEDS_YOU_SUBSTATUS: Record<string, string> = {
  new: "New issue",
  regressed: "Regressed",
  escalating: "Escalating",
}
const INFO_WINDOW_MS = 24 * 3_600_000

function plural(n: number, word: string) {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`
}

export function fromSentry(issues: readonly SentryIssue[], now: Date): RealInboxItem[] {
  const out: RealInboxItem[] = []
  for (const issue of issues) {
    if (issue.status !== "unresolved") continue
    if (issue.level !== "error" && issue.level !== "fatal") continue
    if (!SENTRY_URL.test(issue.permalink)) continue
    const label = issue.substatus ? NEEDS_YOU_SUBSTATUS[issue.substatus] : undefined
    const needsYou = label !== undefined
    if (!needsYou && now.getTime() - Date.parse(issue.lastSeen) > INFO_WINDOW_MS) continue
    const events = Number(issue.count) || 0
    out.push({
      id: `sentry-${issue.id}`,
      source: "sentry",
      title: `${issue.level === "fatal" ? "Crash" : "Error"} · ${label ?? "Ongoing"}`,
      snippet: `${issue.shortId} ${issue.title} · ${plural(events, "event")}, ${plural(issue.userCount ?? 0, "user")}`,
      at: issue.substatus === "new" ? issue.firstSeen : issue.lastSeen,
      unread: needsYou,
      url: issue.permalink,
    })
  }
  return out
}

/* ------------------------------------------------------------------ merge */

export function mergeInbox(...lists: RealInboxItem[][]): RealInboxItem[] {
  return lists.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
}

/** The rows that need the founder, in Inbox order: Home's "Needs you". */
export function needsYouItems(items: readonly RealInboxItem[]): RealInboxItem[] {
  return items.filter((i) => i.unread && !i.dismissed)
}

/* ---------------------------------------------------------------- browser */

const STATUSES = new Set<InboxSourceStatus>(["connecting", "connected", "stale", "not_connected"])

/** A response body read back defensively; anything incomplete is null. */
export function parseInboxResponse(value: unknown): InboxResponse | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.fetchedAt !== "string" || !Number.isFinite(Date.parse(v.fetchedAt))) return null
  const sources = v.sources as Record<string, { status?: unknown; fetchedAt?: unknown }> | undefined
  if (!sources || typeof sources !== "object") return null
  for (const id of INBOX_SOURCES) {
    const s = sources[id]
    if (!s || !STATUSES.has(s.status as InboxSourceStatus)) return null
    if (s.fetchedAt !== null && typeof s.fetchedAt !== "string") return null
  }
  if (!Array.isArray(v.items)) return null
  const ok = v.items.every(
    (i: Record<string, unknown>) =>
      i &&
      typeof i.id === "string" &&
      INBOX_SOURCES.includes(i.source as InboxSourceId) &&
      typeof i.title === "string" &&
      typeof i.snippet === "string" &&
      typeof i.at === "string" &&
      typeof i.unread === "boolean" &&
      typeof i.url === "string" &&
      /^https:\/\//.test(i.url)
  )
  return ok ? (v as unknown as InboxResponse) : null
}

/** "GitHub connecting…", "Gmail not connected": one line per source that is not live. */
export function sourceNotes(sources: InboxResponse["sources"]): string[] {
  return INBOX_SOURCES.flatMap((id) => {
    const { status } = sources[id]
    if (status === "connected") return []
    const word = status === "connecting" ? "Connecting…" : status === "stale" ? "Last updated earlier" : "Not connected"
    return [`${SOURCE_LABEL[id]}: ${word}`]
  })
}

/** The browser's copy: loading until the endpoint first answers. */
export type InboxView = { phase: "loading" } | { phase: "ready"; inbox: InboxResponse }

export const INBOX_CONNECTING_POLL_MS = 5_000
export const INBOX_POLL_MS = 60_000

export function inboxPollMs(view: InboxView) {
  if (view.phase !== "ready") return INBOX_POLL_MS
  return INBOX_SOURCES.some((id) => view.inbox.sources[id].status === "connecting") ? INBOX_CONNECTING_POLL_MS : INBOX_POLL_MS
}

/**
 * Our own endpoint failing: the last rows stay, each live source marked
 * stale; with none yet, every source reads not connected and there are no
 * rows (never sample ones).
 */
export function onInboxFailure(view: InboxView, now: Date): InboxView {
  if (view.phase === "ready") {
    const sources = Object.fromEntries(
      INBOX_SOURCES.map((id) => {
        const s = view.inbox.sources[id]
        return [id, s.status === "connected" ? { ...s, status: "stale" } : s.status === "connecting" ? { status: "not_connected", fetchedAt: null } : s]
      })
    ) as InboxResponse["sources"]
    return { phase: "ready", inbox: { ...view.inbox, sources } }
  }
  return {
    phase: "ready",
    inbox: {
      fetchedAt: now.toISOString(),
      sources: Object.fromEntries(INBOX_SOURCES.map((id) => [id, { status: "not_connected", fetchedAt: null }])) as InboxResponse["sources"],
      items: [],
    },
  }
}

/* ------------------------------------------------------------------ screens */

/**
 * One status for the whole Inbox, as Home and the Inbox tab show it. Any
 * source live (connected, else stale) wins; otherwise connecting only if a
 * source really is mid first sync (the server never reports connecting
 * without a token, and a failed first sync is not_connected); otherwise
 * not connected.
 */
export function inboxStatus(sources: InboxResponse["sources"]): InboxSourceStatus {
  const all = INBOX_SOURCES.map((id) => sources[id].status)
  if (all.includes("connected")) return "connected"
  if (all.includes("stale")) return "stale"
  if (all.includes("connecting")) return "connecting"
  return "not_connected"
}

/** The oldest last sync among stale sources: what "Last updated …" names. */
export function staleSince(sources: InboxResponse["sources"]): Date | null {
  const times = INBOX_SOURCES.filter((id) => sources[id].status === "stale")
    .map((id) => sources[id].fetchedAt)
    .filter((at): at is string => at !== null && Number.isFinite(Date.parse(at)))
    .map((at) => Date.parse(at))
  return times.length ? new Date(Math.min(...times)) : null
}

/**
 * What a screen renders from the browser's copy. `loading` until the
 * endpoint first answers, then the overall status with the rows (never
 * sample ones; empty when nothing is live).
 */
export type InboxScreen = {
  status: InboxSourceStatus | "loading"
  items: RealInboxItem[]
  /** Set when some source is stale. */
  staleSince: Date | null
  notes: string[]
}

export function inboxScreen(view: InboxView): InboxScreen {
  if (view.phase === "loading") return { status: "loading", items: [], staleSince: null, notes: [] }
  const { sources, items } = view.inbox
  return { status: inboxStatus(sources), items, staleSince: staleSince(sources), notes: sourceNotes(sources) }
}
