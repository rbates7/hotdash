import fs from "node:fs"
import path from "node:path"

import { test, type Page } from "@playwright/test"

import { connectingSummary, liveSummary } from "../src/test/stripe-fixture"
import type { StripeSummary } from "../src/lib/stripe-summary"
import { waitForHydration } from "./support/shell"
import { mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"

/**
 * Review stills for the connecting state (a key, first sync still running),
 * against a production build so the dev badge is absent. The summary is
 * mocked as `connecting`; a build without the state reads that as not
 * connected, which is what a fresh server showed before (the "before" set).
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/connecting-state-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/connecting-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

/**
 * Three states: connecting (the base names, matching the "before" set),
 * live (`-live`, mocked connected) and not connected (`-not-connected`,
 * the real server with no key — nothing mocked).
 */
const STATES: { suffix: string; summary: () => StripeSummary | null }[] = [
  { suffix: "", summary: () => connectingSummary() },
  { suffix: "-live", summary: () => liveSummary("connected") },
  { suffix: "-not-connected", summary: () => null },
]

async function shoot(
  page: Page,
  route: string,
  name: string,
  vp: { width: number; height: number },
  theme: "light" | "dark",
  state: (typeof STATES)[number]
) {
  await page.setViewportSize(vp)
  const summary = state.summary()
  if (summary) await mockStripe(page, summary)
  await page.goto(route)
  await waitForHydration(page)
  await setTheme(page, theme)
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(500)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${name}-${vp.width}-${theme}${state.suffix}.png`), await page.screenshot({ fullPage: true }))
}

// STATES=connecting captures only the base set (what a build without the
// connecting state can be compared on); by default all three.
const only = process.env.STATES === "connecting" ? STATES.slice(0, 1) : STATES

for (const state of only) {
  for (const vp of WIDTHS) {
    for (const theme of ["light", "dark"] as const) {
      const tag = `${vp.width} ${theme}${state.suffix}`
      test(`home ${tag}`, async ({ page }) => shoot(page, "/home", "home", vp, theme, state))
      test(`metrics ${tag}`, async ({ page }) => shoot(page, "/metrics", "metrics", vp, theme, state))
      test(`settings ${tag}`, async ({ page }) => shoot(page, "/settings", "settings", vp, theme, state))
    }
  }
}
