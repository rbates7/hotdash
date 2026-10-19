import { expect, test } from "@playwright/test"

/**
 * `GET /api/workboard` answers the promised shape. The test server has no
 * GitHub token (see playwright.config.ts), so it is "not connected" — never
 * "connecting", which needs a token: no items, never an error. Field names
 * are pinned exactly.
 */
test("GET /api/workboard: exact shape, not connected without a token", async ({ request }) => {
  const res = await request.get("/api/workboard")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("application/json")
  expect(res.headers()["cache-control"]).toContain("no-store")

  const body = await res.json()
  expect(Object.keys(body).sort()).toEqual(["connected", "fetchedAt", "items", "stale", "status"])
  expect(body.status).toBe("not_connected")
  expect(body.connected).toBe(false)
  expect(body.stale).toBe(false)
  expect(body.items).toEqual([])
  expect(typeof body.fetchedAt).toBe("string")
  expect(new Date(body.fetchedAt).toISOString()).toBe(body.fetchedAt)
})
