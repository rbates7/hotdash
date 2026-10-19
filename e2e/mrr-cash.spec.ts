import { expect, test } from "@playwright/test"

import { waitForHydration } from "./support/shell"

/**
 * `GET /api/stripe/mrr-cash` and its panel on Metrics › Overview. The test
 * server has no Stripe key (see playwright.config.ts), so it is "not
 * connected", never "connecting" (which needs a key): no figures, never an
 * error body, and the panel says so without sample numbers.
 */
test("GET /api/stripe/mrr-cash: not connected without a key, exact shape", async ({ request }) => {
  const res = await request.get("/api/stripe/mrr-cash?tz=America/Chicago")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("application/json")
  expect(res.headers()["cache-control"]).toContain("no-store")
  expect(await res.json()).toEqual({ status: "not_connected", lastSyncedAt: null })
})

test("Metrics › Overview shows the MRR and cash panel as Stripe not connected", async ({ page }) => {
  await page.goto("/metrics")
  await waitForHydration(page)
  const panel = page.getByTestId("mrr-cash-panel")
  await expect(panel).toHaveAttribute("data-state", "not_connected")
  await expect(panel.getByRole("status")).toHaveText("Stripe not connected")
  await expect(panel).not.toContainText(/sample/i)
  await expect(panel).not.toContainText(/\$\d/)
})
