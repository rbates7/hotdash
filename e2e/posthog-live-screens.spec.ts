import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { livePosthogSummary, mockPosthog } from "./support/posthog"
import { setTheme } from "./support/theme"

/**
 * Review stills for live PostHog on Metrics, against a production build so
 * the dev badge is absent: 4 widths × light/dark × not connected (the real
 * server with no key), connected and stale (a mocked /api/posthog/summary —
 * fixture figures, never real PostHog data). Stripe is not connected in
 * all of them, so only PostHog's cards are live.
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/posthog-live-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/posthog-live-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

const STATES = ["not-connected", "connected", "stale"] as const

async function capture(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(300)
  return page.screenshot({ fullPage: true })
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    for (const state of STATES) {
      test(`metrics ${vp.width} ${theme} ${state}`, async ({ page }) => {
        await page.setViewportSize(vp)
        if (state !== "not-connected") await mockPosthog(page, livePosthogSummary(state))
        await page.goto("/metrics")
        await waitForHydration(page)
        const retention = page.getByRole("region", { name: "Metric cards" }).getByRole("article", { name: /^Retention\b/ })
        await expect(retention).toHaveAttribute("data-source", state === "not-connected" ? "sample" : "posthog")
        await setTheme(page, theme)
        fs.mkdirSync(OUT, { recursive: true })
        fs.writeFileSync(path.join(OUT, `metrics-${vp.width}-${theme}-${state}.png`), await capture(page))
      })
    }
  }
}
