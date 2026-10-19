import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { livePosthogSummary, mockPosthog } from "./support/posthog"
import { setTheme } from "./support/theme"

/**
 * Review stills for live PostHog on Metrics, against a production build so
 * the dev badge is absent: 4 widths × light/dark × five states —
 *
 * - `not-connected` — the real server with no key;
 * - `connected`, `stale` — a mocked /api/posthog/summary (fixture figures,
 *   never real PostHog data);
 * - `loading` — /api/posthog/summary held unanswered;
 * - `error` — /api/posthog/summary answering 503 (our endpoint unavailable).
 *
 * Stripe is not connected in all of them, so only PostHog's cards are live.
 *
 *   pnpm build && pnpm screens:posthog-live   (SCREENSHOT_DIR=… to choose where)
 *
 * POSTHOG_SHOTS_BASELINE=1 skips the per-state card check so the same
 * stills can be taken of a build from before PostHog existed.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/posthog-live-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

const STATES = ["not-connected", "connected", "stale", "loading", "error"] as const
type State = (typeof STATES)[number]

const BASELINE = Boolean(process.env.POSTHOG_SHOTS_BASELINE)

/** What Retention's card reads as in each state (`data-source`). */
const SOURCE: Record<State, string> = {
  "not-connected": "sample",
  connected: "posthog",
  stale: "posthog",
  loading: "loading",
  error: "sample",
}

async function arrange(page: Page, state: State) {
  if (state === "connected" || state === "stale") return mockPosthog(page, livePosthogSummary(state))
  if (state === "loading") return page.route("**/api/posthog/summary**", () => undefined)
  if (state === "error") {
    return page.route("**/api/posthog/summary**", (route) => route.fulfill({ status: 503, body: "unavailable" }))
  }
}

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
        await arrange(page, state)
        await page.goto("/metrics")
        await waitForHydration(page)
        const retention = page.getByRole("region", { name: "Metric cards" }).getByRole("article", { name: /^Retention\b/ })
        if (!BASELINE) await expect(retention).toHaveAttribute("data-source", SOURCE[state])
        else await expect(retention).toBeVisible()
        await setTheme(page, theme)
        fs.mkdirSync(OUT, { recursive: true })
        fs.writeFileSync(path.join(OUT, `metrics-${vp.width}-${theme}-${state}.png`), await capture(page))
      })
    }
  }
}
