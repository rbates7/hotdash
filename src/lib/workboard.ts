/**
 * The workboard: rbates7/hotdash's open pull requests and the ones merged
 * in the last two weeks, each reduced to a state the board can sort on.
 * Pure — the GitHub reads live in `@/lib/server/workboard`; this module
 * only maps what they return, so every rule here is unit-tested.
 */

export type WorkboardState = "working" | "needs_fix" | "ready_for_review" | "merged"
export type WorkboardCi = "passing" | "failing" | "pending" | "none"
export type WorkboardReview = "approved" | "changes_requested" | "pending" | "none"

/**
 * One board row: title, status (state, CI, review), owner and dates, plus
 * the PR's number and GitHub's own `html_url`. No description text, no
 * links from the description, no branch name.
 */
export type WorkboardItem = {
  number: number
  title: string
  url: string
  /** The PR author's login. */
  owner: string
  state: WorkboardState
  ci: WorkboardCi
  review: WorkboardReview
  updatedAt: string
  mergedAt: string | null
}

/**
 * What `GET /api/workboard` returns. No token, no error text. `status`
 * follows the same rules as the Stripe summary (`@/lib/server/stripe`):
 *
 * - `connecting`    — a usable token is set and the first sync is still
 *                     running (a fresh server, just after a deploy):
 *                     `connected: false`, no items yet.
 * - `connected`     — the last sync succeeded within the cache window
 *                     (`connected: true, stale: false`); `fetchedAt` is when
 *                     it ran.
 * - `stale`         — the last sync failed; these are the last good items,
 *                     as of `fetchedAt` (`connected: true, stale: true`).
 * - `not_connected` — no (usable) token, or no sync has ever succeeded (a
 *                     failed first sync, and every retry after it, is not
 *                     connecting again): `connected: false`, `items` is
 *                     empty and `fetchedAt` is the time of the answer.
 */
export type WorkboardResponse = {
  status: "connected" | "stale" | "connecting" | "not_connected"
  connected: boolean
  fetchedAt: string
  stale: boolean
  items: WorkboardItem[]
}

export const WORKBOARD_PATH = "/api/workboard"

/** Merged PRs stay on the board this long. */
export const MERGED_LOOKBACK_DAYS = 14

export function notConnected(now: Date): WorkboardResponse {
  return { status: "not_connected", connected: false, fetchedAt: now.toISOString(), stale: false, items: [] }
}

/* -------------------------------------------------------------------- ci */

/** The fields read from `GET /commits/{sha}/check-runs`. */
export type CheckRun = { status: string; conclusion: string | null }
/** The fields read from `GET /commits/{sha}/status` (the combined status). */
export type CombinedStatus = { state: string; statuses: ReadonlyArray<{ state: string }> }

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"])

/**
 * Check runs and commit statuses together: any failure is `failing`; else
 * anything not finished is `pending`; else anything at all is `passing`
 * (success, neutral and skipped all pass); nothing is `none`.
 */
export function deriveCi(checkRuns: ReadonlyArray<CheckRun>, status: CombinedStatus | null): WorkboardCi {
  const statuses = status?.statuses ?? []
  if (checkRuns.some((r) => r.status === "completed" && FAILED_CONCLUSIONS.has(r.conclusion ?? ""))) return "failing"
  if (statuses.some((s) => s.state === "failure" || s.state === "error")) return "failing"
  if (checkRuns.some((r) => r.status !== "completed")) return "pending"
  if (statuses.some((s) => s.state === "pending")) return "pending"
  return checkRuns.length + statuses.length > 0 ? "passing" : "none"
}

/* ---------------------------------------------------------------- review */

/** The fields read from `GET /pulls/{n}/reviews` (oldest first). */
export type Review = { user: { login: string } | null; state: string }

/**
 * Each reviewer's latest deciding review (a later comment does not undo an
 * approval or a change request; a dismissal does). Any change request wins,
 * then any approval; reviews or requested reviewers with neither are
 * `pending`; no review activity at all is `none`.
 */
export function deriveReview(reviews: ReadonlyArray<Review>, requestedReviewers = 0): WorkboardReview {
  const latest = new Map<string, string>()
  for (const r of reviews) {
    const login = r.user?.login
    if (!login) continue
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") latest.set(login, r.state)
    else if (!latest.has(login)) latest.set(login, r.state)
  }
  const states = [...latest.values()]
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested"
  if (states.includes("APPROVED")) return "approved"
  return states.length > 0 || requestedReviewers > 0 ? "pending" : "none"
}

/* ----------------------------------------------------------------- state */

/**
 * merged > needs_fix (failed checks, changes requested or a merge
 * conflict) > working (draft, or CI still running) > ready_for_review.
 */
export function deriveState(pr: {
  merged: boolean
  draft: boolean
  ci: WorkboardCi
  review: WorkboardReview
  conflict: boolean
}): WorkboardState {
  if (pr.merged) return "merged"
  if (pr.ci === "failing" || pr.review === "changes_requested" || pr.conflict) return "needs_fix"
  if (pr.draft || pr.ci === "pending") return "working"
  return "ready_for_review"
}

/**
 * `GET /pulls/{n}`: a conflict is `mergeable: false` or `mergeable_state:
 * "dirty"`. `mergeable: null` means GitHub has not worked it out yet — not
 * a conflict.
 */
export function hasConflict(detail: { mergeable: boolean | null; mergeable_state?: string | null } | null) {
  return detail?.mergeable === false || detail?.mergeable_state === "dirty"
}

/* ------------------------------------------------------------------ item */

/**
 * The fields read from the pull list (`GET /pulls`). The PR description
 * (`body`) is never read: the board is public, so nothing from a PR body,
 * and no link taken from one, reaches `/api/workboard` (Coulson, Oct 19).
 */
export type PullSummary = {
  number: number
  title: string
  html_url: string
  user: { login: string } | null
  head: { ref: string; sha: string }
  draft?: boolean
  updated_at: string
  merged_at: string | null
  requested_reviewers?: ReadonlyArray<unknown>
}

/** What a sync fetches per open PR; merged PRs have none. */
export type PullDetails = {
  checkRuns: ReadonlyArray<CheckRun>
  status: CombinedStatus | null
  reviews: ReadonlyArray<Review>
  conflict: boolean
}

/**
 * One board row. A merged PR is not re-checked (its CI and reviews no
 * longer matter), so its `ci` and `review` are `none`.
 */
export function toWorkboardItem(pr: PullSummary, details: PullDetails | null): WorkboardItem {
  const merged = pr.merged_at !== null
  const ci = merged || !details ? "none" : deriveCi(details.checkRuns, details.status)
  const review = merged || !details ? "none" : deriveReview(details.reviews, pr.requested_reviewers?.length ?? 0)
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    owner: pr.user?.login ?? "",
    state: deriveState({ merged, draft: Boolean(pr.draft), ci, review, conflict: Boolean(details?.conflict) }),
    ci,
    review,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
  }
}

/** The only keys an item may carry out of `/api/workboard`. */
export const WORKBOARD_ITEM_KEYS = [
  "number",
  "title",
  "url",
  "owner",
  "state",
  "ci",
  "review",
  "updatedAt",
  "mergedAt",
] as const satisfies ReadonlyArray<keyof WorkboardItem>

/**
 * A copy of `item` with only `WORKBOARD_ITEM_KEYS`: anything else (a PR
 * body, proof links, a branch) is dropped, whatever put it there.
 */
export function publicWorkboardItem(item: WorkboardItem): WorkboardItem {
  const out = {} as Record<string, unknown>
  for (const k of WORKBOARD_ITEM_KEYS) out[k] = item[k]
  return out as WorkboardItem
}

/** `res` with every item reduced to `publicWorkboardItem`. */
export function publicWorkboardResponse(res: WorkboardResponse): WorkboardResponse {
  // Allow-listed like each item: only these keys leave the server.
  return {
    status: res.status,
    connected: res.connected,
    fetchedAt: res.fetchedAt,
    stale: res.stale,
    items: res.items.map(publicWorkboardItem),
  }
}
