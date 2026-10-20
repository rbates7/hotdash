// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

/** A fake token: shaped like GitHub's, valid nowhere. */
const TOKEN = "ghp_hotdashUnitTestOnly0000000000000"

const BODY = [
  "Secret description text.",
  "![proof](https://example.com/proof-shot.png)",
  '<img src="https://cdn.example.com/inline.jpg">',
  "https://github.com/user-attachments/assets/1f2e3d4c-aaaa-bbbb-cccc-0123456789ab",
  "[docs](https://example.com/body-link)",
].join("\n")

const pr = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/rbates7/hotdash/pull/${number}`,
  user: { login: "dev" },
  head: { ref: `feat/branch-${number}`, sha: `sha${number}` },
  draft: false,
  body: BODY,
  proofLinks: ["https://example.com/proof-shot.png"],
  updated_at: "2026-10-16T10:00:00Z",
  merged_at: null,
  requested_reviewers: [],
  ...extra,
})

/** GitHub as the route's loader sees it: every PR has a body full of links. */
const ROUTES: Record<string, unknown> = {
  "/pulls?state=open": [pr(3)],
  "/pulls?state=closed": [pr(2, { merged_at: new Date().toISOString(), updated_at: new Date().toISOString() })],
  "/pulls/3": { mergeable: true, mergeable_state: "clean", body: BODY },
  "/commits/sha3/check-runs": { check_runs: [{ status: "completed", conclusion: "success" }] },
  "/commits/sha3/status": { state: "success", statuses: [] },
  "/pulls/3/reviews": [{ state: "COMMENTED", body: BODY, user: { login: "rev" } }],
}

vi.mock("next/server", () => ({ after: () => {} }))

vi.mock("@/lib/server/workboard", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/server/workboard")>()
  const fetchImpl = (async (input: string | URL | Request) => {
    const path = String(input).replace("https://api.github.com/repos/rbates7/hotdash", "")
    const key = Object.keys(ROUTES).find((k) => path === k || path.startsWith(`${k}?`) || path.startsWith(`${k}&`))
    return key ? Response.json(ROUTES[key]) : new Response("not found", { status: 404 })
  }) as typeof fetch
  return {
    ...actual,
    workboardService: actual.createWorkboardService({
      env: () => ({ GITHUB_READONLY_TOKEN: TOKEN }),
      load: actual.createGitHubLoader(fetchImpl),
      log: () => {},
    }),
  }
})

describe("GET /api/workboard", () => {
  it("drops PR bodies and every body-derived link from GitHub's data", async () => {
    const { GET } = await import("./route")
    const { workboardService } = await import("@/lib/server/workboard")
    await GET()
    await workboardService.settled()
    const res = await GET()
    const text = await res.text()
    const json = JSON.parse(text)

    expect(json.status).toBe("connected")
    expect(Object.keys(json).sort()).toEqual(["connected", "fetchedAt", "items", "stale", "status"])
    expect(json.items.map((i: { number: number }) => i.number).sort()).toEqual([2, 3])
    for (const item of json.items) {
      expect(Object.keys(item).sort()).toEqual(["ci", "mergedAt", "number", "owner", "review", "state", "title", "updatedAt", "url"])
      expect(item.url).toBe(`https://github.com/rbates7/hotdash/pull/${item.number}`)
    }
    for (const leak of [
      "Secret description",
      "proof-shot.png",
      "inline.jpg",
      "user-attachments",
      "body-link",
      "example.com",
      "feat/branch-",
      '"body"',
      "proofLinks",
      "branch",
    ]) {
      expect(text).not.toContain(leak)
    }
    // The only URLs left are GitHub's own PR URLs.
    expect(text.match(/https?:\/\/[^"\s]+/g)).toEqual(json.items.map((i: { url: string }) => i.url))
  })
})
