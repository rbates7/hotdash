import { describe, expect, it } from "vitest"

import {
  deriveCi,
  deriveReview,
  deriveState,
  extractProofLinks,
  hasConflict,
  notConnected,
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

describe("extractProofLinks", () => {
  it("is empty for no body", () => {
    expect(extractProofLinks(null)).toEqual([])
    expect(extractProofLinks("")).toEqual([])
    expect(extractProofLinks("No screenshots, see https://example.com/docs.")).toEqual([])
  })

  it("finds markdown images, <img> tags, bare image links and user-attachments, in order, deduped", () => {
    const body = [
      "## Proof",
      "![home](https://example.com/a.png)",
      '<img width="400" alt="x" src="https://example.com/b.jpg">',
      "Bare: https://example.com/c.webp, and https://example.com/d.JPEG.",
      "https://github.com/user-attachments/assets/1f2e3d4c-aaaa-bbbb-cccc-0123456789ab",
      "Again ![dupe](https://example.com/a.png \"title\") and <img src='https://example.com/e.gif' />",
      "Not proof: https://example.com/page.html https://github.com/rbates7/hotdash/pull/1",
    ].join("\n")
    expect(extractProofLinks(body)).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.jpg",
      "https://example.com/c.webp",
      "https://example.com/d.JPEG",
      "https://github.com/user-attachments/assets/1f2e3d4c-aaaa-bbbb-cccc-0123456789ab",
      "https://example.com/e.gif",
    ])
  })

  it("takes markdown/<img> URLs without an image extension, and keeps query strings", () => {
    expect(
      extractProofLinks("![s](https://github.com/user-attachments/assets/abc) <img src=\"https://cdn.example.com/shot?id=1\">")
    ).toEqual(["https://github.com/user-attachments/assets/abc", "https://cdn.example.com/shot?id=1"])
    expect(extractProofLinks("see https://example.com/x.png?raw=true")).toEqual(["https://example.com/x.png?raw=true"])
  })

  it("does not count a markdown image's URL twice", () => {
    expect(extractProofLinks("![a](https://example.com/a.png)")).toEqual(["https://example.com/a.png"])
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
    body: "![](https://example.com/a.png)",
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
      branch: "feat/workboard-data",
      state: "ready_for_review",
      ci: "passing",
      review: "none",
      proofLinks: ["https://example.com/a.png"],
      updatedAt: "2026-10-16T10:00:00Z",
      mergedAt: null,
    })
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
