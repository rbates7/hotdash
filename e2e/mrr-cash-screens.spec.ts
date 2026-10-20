import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { CONNECTING } from "../src/lib/stripe-summary"
import { MRR_CASH_CONNECTING } from "../src/lib/stripe-mrr-cash"
import { waitForHydration } from "./support/shell"
import { vetUnmockedApi } from "./support/shots"
import { liveMrrCash, liveSummary, mockMrrCash, mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"

/**
 * Review stills for #53: Metrics › Overview with the MRR and cash panel, at
 * four widths in both themes. STATE picks one:
 *   not-connected — the real server with no key (nothing mocked)
 *   connecting    — /api/stripe/summary and /api/stripe/mrr-cash mocked connecting
 *   connected     — both mocked from the Stripe fixture (never real Stripe data)
 *   stale         — both mocked stale from the same fixture
 * SCREENSHOT_TAG is "before" (develop) or "after" (the PR head). Always
 * against a production build (`pnpm build && pnpm start`); nothing hides
 * the Next.js dev portal, and each shot asserts there is none, so a shot
 * from a dev server fails instead of passing. See
 * scripts/mrr-cash-reshoot.sh for the full before/after run into a folder
 * named by both SHAs.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/mrr-cash-shots")
const STATE = process.env.STATE ?? "not-connected"
const TAG = process.env.SCREENSHOT_TAG ?? "after"

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

async function mock(page: Page) {
  if (STATE === "not-connected") return
  if (STATE === "connecting") {
    await mockStripe(page, CONNECTING)
    await mockMrrCash(page, MRR_CASH_CONNECTING)
    return
  }
  const status = STATE === "stale" ? "stale" : "connected"
  await mockStripe(page, liveSummary(status))
  await mockMrrCash(page, liveMrrCash(status))
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`metrics ${TAG} ${STATE} ${vp.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(vp)
      const noLiveData = await vetUnmockedApi(page)
      await mock(page)
      await page.goto("/metrics")
      await waitForHydration(page)
      await setTheme(page, theme)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      const panel = page.getByTestId("mrr-cash-panel")
      if (TAG === "after") {
        const want = { "not-connected": "not_connected", connecting: "connecting", connected: "live", stale: "live" }[STATE]
        await expect(panel).toHaveAttribute("data-state", want ?? "")
      }
      if (TAG === "after" && STATE === "stale") await expect(panel.getByTestId("mrr-cash-updated")).toBeVisible()
      // Production build only: the dev overlay's portal is never hidden, so it must not exist at all.
      await expect(page.locator("nextjs-portal")).toHaveCount(0)
      await page.waitForTimeout(400)
      fs.mkdirSync(OUT, { recursive: true })
      const suffix = STATE === "not-connected" ? "" : `-${STATE}`
      await page.screenshot({ path: path.join(OUT, `metrics-${vp.width}-${theme}-${TAG}${suffix}.png`), fullPage: true })
      noLiveData()
    })
  }
}
