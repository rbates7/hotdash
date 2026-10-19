import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { CONNECTING } from "../src/lib/stripe-summary"
import { MRR_CASH_CONNECTING, type MrrCashSummary } from "../src/lib/stripe-mrr-cash"
import { SYNCED_AT } from "../src/test/stripe-fixture"
import { waitForHydration } from "./support/shell"
import { liveSummary, mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"

/**
 * Review stills for #53: Metrics › Overview with the MRR and cash panel, at
 * four widths in both themes. STATE picks one:
 *   not-connected — the real server with no key (nothing mocked)
 *   connecting    — /api/stripe/summary and /api/stripe/mrr-cash mocked connecting
 *   connected     — both mocked from the Stripe fixture (never real Stripe data)
 * Against a production build so the dev badge is absent:
 *
 *   pnpm build && CI=true SCREENSHOTS=1 STATE=… SCREENSHOT_DIR=… playwright test e2e/mrr-cash-screens.spec.ts
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

/** The fixture's week (Mon Oct 12 – Sun Oct 18, Central) and twelve months ending at its MRR. */
const MRR = [44_100, 45_800, 47_200, 48_000, 49_900, 52_000, 54_000, 56_000, 57_500, 58_300, 59_000, 61_234.56]
const LIVE_MRR_CASH: MrrCashSummary = {
  status: "connected",
  lastSyncedAt: SYNCED_AT,
  mrr: {
    points: MRR.map((value, i) => {
      const m = new Date(Date.UTC(2025, 10 + i, 1))
      return { month: m.toISOString().slice(0, 7), value, partial: i === MRR.length - 1 }
    }),
  },
  cash: {
    since: "2026-10-12T05:00:00.000Z",
    value: 4_321.5,
    previous: 3_900,
    days: [
      { date: "2026-10-12", value: 2_000, previous: 1_500 },
      { date: "2026-10-13", value: 2_321.5, previous: 2_400 },
      { date: "2026-10-14", value: null, previous: null },
      { date: "2026-10-15", value: null, previous: null },
      { date: "2026-10-16", value: null, previous: null },
      { date: "2026-10-17", value: null, previous: null },
      { date: "2026-10-18", value: null, previous: null },
    ],
  },
}

async function mock(page: Page) {
  if (STATE === "not-connected") return
  await mockStripe(page, STATE === "connected" ? liveSummary() : CONNECTING)
  const answer = STATE === "connected" ? LIVE_MRR_CASH : MRR_CASH_CONNECTING
  await page.route("**/api/stripe/mrr-cash**", (route) =>
    route.fulfill({ json: answer, headers: { "Cache-Control": "no-store" } })
  )
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`metrics ${TAG} ${STATE} ${vp.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mock(page)
      await page.goto("/metrics")
      await waitForHydration(page)
      await setTheme(page, theme)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      const panel = page.getByTestId("mrr-cash-panel")
      if (TAG === "after") {
        const want = { "not-connected": "not_connected", connecting: "connecting", connected: "live" }[STATE]
        await expect(panel).toHaveAttribute("data-state", want ?? "")
      }
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
      await page.waitForTimeout(400)
      fs.mkdirSync(OUT, { recursive: true })
      const suffix = STATE === "not-connected" ? "" : `-${STATE}`
      await page.screenshot({ path: path.join(OUT, `metrics-${vp.width}-${theme}-${TAG}${suffix}.png`), fullPage: true })
    })
  }
}
