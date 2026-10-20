import { describe, expect, it } from "vitest"

import {
  deriveCi,
  deriveReview,
  deriveState,
  hasConflict,
  notConnected,
  publicWorkboardItem,
  publicWorkboardResponse,
  toWorkboardItem,
  type PullSummary,
  type WorkboardCi,
  type WorkboardReview,
} from "@/lib/workboard"

const done = (conclusion: string) => ({ status: "completed", conclusion })
const status = (...states: string[]) => ({ state: states[0] ?? "pending", statuses: states.map((state) => ({ state })) })

describe("deriveCi", () => {
  it("is none with no check runs and no statuses (an empty combined status is 'pending' on GitHub)", () => {
    expect(deriveCi([], null)).toBe("none")
    expect(deriveCi([], { state: "pending", statuses: [] })).toBe("none")
  })

  it("is failing on any failed check run or failed/errored status", () => {
    for (const c of ["failure", "timed_out", "cancelled", "action_required", "startup_failure"]) {
      expect(deriveCi([done("success"), done(c)], null)).toBe("failing")
    }
    expect(deriveCi([], status("failure"))).toBe("failing")
    expect(deriveCi([], status("success", "error"))).toBe("failing")
    // A failure beats something still running.
    expect(deriveCi([{ status: "in_progress", conclusion: null }, done("failure")], null)).toBe("failing")
  })

  it("is pending while a check run or status has not finished", () => {
    expect(deriveCi([{ status: "queued", conclusion: null }], null)).toBe("pending")
    expect(deriveCi([done("success"), { status: "in_progress", conclusion: null }], null)).toBe("pending")
    expect(deriveCi([done("success")], status("pending"))).toBe("pending")
  })

  it("is passing when everything finished well (neutral and skipped pass)", () => {
    expect(deriveCi([done("success"), done("neutral"), done("skipped")], null)).toBe("passing")
    expect(deriveCi([], status("success"))).toBe("passing")
    expect(deriveCi([done("success")], status("success"))).toBe("passing")
  })
})

describe("deriveReview", () => {
  const r = (login: string, state: string) => ({ user: { login }, state })

  it("is none with no reviews and no requested reviewers, pending with either but no decision", () => {
    expect(deriveReview([])).toBe("none")
    expect(deriveReview([], 1)).toBe("pending")
    expect(deriveReview([r("a", "COMMENTED")])).toBe("pending")
  })

  it("takes each reviewer's latest deciding review", () => {
    expect(deriveReview([r("a", "CHANGES_REQUESTED"), r("a", "APPROVED")])).toBe("approved")
    expect(deriveReview([r("a", "APPROVED"), r("a", "CHANGES_REQUESTED")])).toBe("changes_requested")
    // A later comment does not undo a decision; a dismissal does.
    expect(deriveReview([r("a", "APPROVED"), r("a", "COMMENTED")])).toBe("approved")
    expect(deriveReview([r("a", "CHANGES_REQUESTED"), r("a", "DISMISSED")])).toBe("pending")
  })

  it("any reviewer's change request beats another's approval", () => {
    expect(deriveReview([r("a", "APPROVED"), r("b", "CHANGES_REQUESTED")])).toBe("changes_requested")
    expect(deriveReview([r("a", "APPROVED"), r("b", "COMMENTED")])).toBe("approved")
  })

  it("ignores reviews from deleted users", () => {
    expect(deriveReview([{ user: null, state: "CHANGES_REQUESTED" }])).toBe("none")
  })
})

describe("deriveState", () => {
  const base = { merged: false, draft: false, ci: "passing" as WorkboardCi, review: "none" as WorkboardReview, conflict: false }

  it("maps each rule", () => {
    expect(deriveState({ ...base, merged: true })).toBe("merged")
    expect(deriveState({ ...base, ci: "failing" })).toBe("needs_fix")
    expect(deriveState({ ...base, review: "changes_requested" })).toBe("needs_fix")
    expect(deriveState({ ...base, conflict: true })).toBe("needs_fix")
    expect(deriveState({ ...base, draft: true })).toBe("working")
    expect(deriveState({ ...base, ci: "pending" })).toBe("working")
    expect(deriveState(base)).toBe("ready_for_review")
    expect(deriveState({ ...base, ci: "none" })).toBe("ready_for_review")
    expect(deriveState({ ...base, review: "approved" })).toBe("ready_for_review")
    expect(deriveState({ ...base, review: "pending" })).toBe("ready_for_review")
  })

  it("merged > needs_fix > working > ready_for_review", () => {
    const worst = { merged: true, draft: true, ci: "failing" as const, review: "changes_requested" as const, conflict: true }
    expect(deriveState(worst)).toBe("merged")
    expect(deriveState({ ...worst, merged: false })).toBe("needs_fix")
    expect(deriveState({ ...base, draft: true, ci: "failing" })).toBe("needs_fix")
    expect(deriveState({ ...base, draft: true, conflict: true })).toBe("needs_fix")
    expect(deriveState({ ...base, ci: "pending", review: "changes_requested" })).toBe("needs_fix")
    expect(deriveState({ ...base, draft: true, review: "approved" })).toBe("working")
  })
})

describe("hasConflict", () => {
  it("is a conflict only when GitHub says so", () => {
    expect(hasConflict({ mergeable: false, mergeable_state: "dirty" })).toBe(true)
    expect(hasConflict({ mergeable: true, mergeable_state: "dirty" })).toBe(true)
    expect(hasConflict({ mergeable: false })).toBe(true)
    expect(hasConflict({ mergeable: null, mergeable_state: "unknown" })).toBe(false)
    expect(hasConflict({ mergeable: true, mergeable_state: "blocked" })).toBe(false)
    expect(hasConflict(null)).toBe(false)
  })
})

describe("toWorkboardItem", () => {
  const pr: PullSummary = {
    number: 44,
    title: "Workboard data",
    html_url: "https://github.com/rbates7/hotdash/pull/44",
    user: { login: "rbates7" },
    head: { ref: "feat/workboard-data", sha: "abc123" },
    draft: false,
    updated_at: "2026-10-16T10:00:00Z",
    merged_at: null,
    requested_reviewers: [],
  }

  it("maps an open PR with its details", () => {
    expect(
      toWorkboardItem(pr, { checkRuns: [{ status: "completed", conclusion: "success" }], status: null, reviews: [], conflict: false })
    ).toEqual({
      number: 44,
      title: "Workboard data",
      url: "https://github.com/rbates7/hotdash/pull/44",
      owner: "rbates7",
      state: "ready_for_review",
      ci: "passing",
      review: "none",
      updatedAt: "2026-10-16T10:00:00Z",
      mergedAt: null,
    })
  })

  it("never carries the PR body, links from it, or the branch, even when GitHub sends them", () => {
    const raw = {
      ...pr,
      body: "Secret plan ![proof](https://example.com/proof.png) <img src=\"https://cdn.example.com/b.jpg\"> https://github.com/user-attachments/assets/abc",
      proofLinks: ["https://example.com/proof.png"],
    } as PullSummary
    const item = toWorkboardItem(raw, { checkRuns: [], status: null, reviews: [], conflict: false })
    expect(Object.keys(item).sort()).toEqual(["ci", "mergedAt", "number", "owner", "review", "state", "title", "updatedAt", "url"])
    const json = JSON.stringify(item)
    for (const leak of ["Secret plan", "proof.png", "b.jpg", "user-attachments", "feat/workboard-data", "body", "proofLinks", "branch"]) {
      expect(json).not.toContain(leak)
    }
    expect(item.url).toBe(pr.html_url)
  })

  it("maps a merged PR without details", () => {
    expect(toWorkboardItem({ ...pr, merged_at: "2026-10-15T10:00:00Z" }, null)).toMatchObject({
      state: "merged",
      ci: "none",
      review: "none",
      mergedAt: "2026-10-15T10:00:00Z",
    })
  })
})

describe("notConnected", () => {
  it("is not_connected, not stale, no items", () => {
    const now = new Date("2026-10-16T12:00:00Z")
    expect(notConnected(now)).toEqual({ status: "not_connected", connected: false, fetchedAt: now.toISOString(), stale: false, items: [] })
  })
})

describe("publicWorkboardResponse", () => {
  it("keeps only title, status, owner, dates, number and the PR URL on each item", () => {
    const item = {
      number: 7,
      title: "Seven",
      url: "https://github.com/rbates7/hotdash/pull/7",
      owner: "dev",
      state: "working",
      ci: "pending",
      review: "none",
      updatedAt: "2026-10-16T10:00:00Z",
      mergedAt: null,
      body: "Description text",
      proofLinks: ["https://example.com/proof.png"],
      branch: "feat/seven",
    } as Parameters<typeof publicWorkboardItem>[0]
    expect(publicWorkboardItem(item)).toEqual({
      number: 7,
      title: "Seven",
      url: "https://github.com/rbates7/hotdash/pull/7",
      owner: "dev",
      state: "working",
      ci: "pending",
      review: "none",
      updatedAt: "2026-10-16T10:00:00Z",
      mergedAt: null,
    })
    const res = publicWorkboardResponse({ ...notConnected(new Date("2026-10-16T12:00:00Z")), items: [item] })
    expect(JSON.stringify(res)).not.toMatch(/Description text|proof\.png|feat\/seven|body|proofLinks|branch/)
  })

  it("allow-lists the top-level keys too: an extra field on the response never leaves", () => {
    const res = publicWorkboardResponse({
      ...notConnected(new Date("2026-10-16T12:00:00Z")),
      token: "ghp_x",
      error: "boom",
    } as unknown as Parameters<typeof publicWorkboardResponse>[0])
    expect(Object.keys(res).sort()).toEqual(["connected", "fetchedAt", "items", "stale", "status"])
  })
})
