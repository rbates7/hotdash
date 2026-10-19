/**
 * The workboard: rbates7/hotdash's open pull requests and the ones merged
 * in the last two weeks, each reduced to a state the board can sort on.
 * Pure — the GitHub reads live in `@/lib/server/workboard`; this module
 * only maps what they return, so every rule here is unit-tested.
 */

export type WorkboardState = "working" | "needs_fix" | "ready_for_review" | "merged"
export type WorkboardCi = "passing" | "failing" | "pending" | "none"
export type WorkboardReview = "approved" | "changes_requested" | "pending" | "none"

export type WorkboardItem = {
  number: number
  title: string
  url: string
  /** The PR author's login. */
  owner: string
  /** The head ref. */
  branch: string
  state: WorkboardState
  ci: WorkboardCi
  review: WorkboardReview
  /** Screenshots and other images in the PR body, deduped, in order. */
  proofLinks: string[]
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

/* ----------------------------------------------------------- proof links */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)(?:[?#][^\s]*)?$/i
const ATTACHMENT = /^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+/

/**
 * Image URLs in a PR body, in order of appearance, each once: markdown
 * images `![](url)`, `<img src="url">`, and bare links ending in an image
 * extension or pointing at a GitHub user-attachments asset.
 */
export function extractProofLinks(body: string | null | undefined): string[] {
  if (!body) return []
  const found: { at: number; url: string }[] = []
  const add = (at: number, raw: string) => {
    const url = raw.trim().replace(/^<|>$/g, "")
    if (/^https?:\/\//i.test(url)) found.push({ at, url })
  }
  // ![alt](url "title")
  for (const m of body.matchAll(/!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)[^)]*\)/g)) add(m.index, m[1])
  // <img ... src="url" ...>
  for (const m of body.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    add(m.index, m[1] ?? m[2] ?? m[3])
  }
  // Any other http(s) URL: kept only if it is an image or an attachment.
  for (const m of body.matchAll(/https?:\/\/[^\s<>"'()[\]]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, "")
    if (IMAGE_EXT.test(url) || ATTACHMENT.test(url)) add(m.index, url)
  }
  found.sort((a, b) => a.at - b.at)
  return [...new Set(found.map((f) => f.url))]
}

/* ------------------------------------------------------------------ item */

/** The fields read from the pull list (`GET /pulls`). */
export type PullSummary = {
  number: number
  title: string
  html_url: string
  user: { login: string } | null
  head: { ref: string; sha: string }
  draft?: boolean
  body: string | null
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
    branch: pr.head.ref,
    state: deriveState({ merged, draft: Boolean(pr.draft), ci, review, conflict: Boolean(details?.conflict) }),
    ci,
    review,
    proofLinks: extractProofLinks(pr.body),
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
  }
}
