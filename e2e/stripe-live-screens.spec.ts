import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { APP_STORE_OFF, APP_STORE_ZERO, LIVE_METRICS, liveSummary, mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"

/**
 * Review stills for live Stripe, against a production build so the dev
 * badge is absent. Connected and stale use a mocked /api/stripe/summary
 * (fixture figures, never real Stripe data); not connected is the real
 * server with no key.
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/stripe-live-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/stripe-live-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

async function capture(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(300)
  return page.screenshot({ fullPage: true })
}

function save(name: string, png: Buffer) {
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, name), png)
}

/** Two stills side by side in one image (Home | Settings). */
async function sideBySide(page: Page, left: Buffer, right: Buffer) {
  const src = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`
  await page.setViewportSize({ width: 2 * 1440 + 48, height: 900 })
  await page.setContent(
    `<body style="margin:0;padding:16px;background:#888;display:flex;gap:16px;align-items:flex-start">
       <img src="${src(left)}" style="width:1440px"><img src="${src(right)}" style="width:1440px">
     </body>`
  )
  await page.waitForFunction(() => [...document.images].every((i) => i.complete))
  return page.screenshot({ fullPage: true })
}

async function openLive(page: Page, url: string) {
  await page.goto(url)
  await waitForHydration(page)
  await expect(page.locator("[data-source='stripe']").first()).toBeVisible()
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`home ${vp.width} ${theme} (connected)`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mockStripe(page, liveSummary("connected"))
      await openLive(page, "/home")
      await setTheme(page, theme)
      save(`home-${vp.width}-${theme}.png`, await capture(page))
    })
  }
}

for (const theme of ["light", "dark"] as const) {
test(`metrics 1440 ${theme} (connected)`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStripe(page, liveSummary("connected"))
  await openLive(page, "/metrics")
  await setTheme(page, theme)
  save(`metrics-1440-${theme}.png`, await capture(page))
})

test(`settings 1440 ${theme} (connected)`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStripe(page, liveSummary("connected"))
  await page.goto("/settings")
  await waitForHydration(page)
  await setTheme(page, theme)
  await expect(page.getByTestId("stripe-status")).toHaveText("Connected")
  await page.getByRole("region", { name: "Connected data" }).scrollIntoViewIfNeeded()
  save(`settings-1440-${theme}.png`, await capture(page))
})

test(`not connected 1440 ${theme} (no key: Home + Settings)`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/home")
  await waitForHydration(page)
  await setTheme(page, theme)
  await expect(page.getByRole("article", { name: "Subscribers", exact: true })).toHaveAttribute("data-source", "not_connected")
  const home = await capture(page)
  await page.goto("/settings")
  await waitForHydration(page)
  await expect(
    page.getByRole("region", { name: "Connected data" }).getByText("Not connected", { exact: true })
  ).toHaveCount(4)
  const settings = await capture(page)
  save(`not-connected-home-1440-${theme}.png`, home)
  save(`not-connected-settings-1440-${theme}.png`, settings)
  save(`not-connected-1440-${theme}.png`, await sideBySide(page, home, settings))
})

test(`stale 1440 ${theme} (Home + Settings)`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStripe(page, liveSummary("stale"))
  await openLive(page, "/home")
  await setTheme(page, theme)
  await expect(page.getByTestId("kpi-updated").first()).toBeVisible()
  const home = await capture(page)
  await page.goto("/settings")
  await waitForHydration(page)
  await expect(page.getByTestId("stripe-status")).toContainText("Last updated")
  const settings = await capture(page)
  save(`stale-home-1440-${theme}.png`, home)
  save(`stale-settings-1440-${theme}.png`, settings)
  save(`stale-1440-${theme}.png`, await sideBySide(page, home, settings))
})
}

/**
 * The paying-subscribers PR set (24 files), all mocked — 1,110 + 53 + 174
 * = 1,337, never real Stripe or database figures:
 * - Home and Metrics, Stripe and the App Store connected, at 1440, 1180,
 *   820 and 390, both themes (16);
 * - the ticker's breakdown open at 1440 (hover) and 390 (keyboard focus:
 *   the ticker is in the top bar there), both themes (4);
 * - Home with the App Store not connected at 1440 and 390, both themes (4).
 * Run on its own so the set above is not rewritten into the same folder:
 *
 *   STRIPE_READONLY_KEY= SCREENSHOT_DIR=… pnpm screens:stripe-live -g paying-subs
 */
const PAYING_SUBS_WIDTHS = [WIDTHS[3], WIDTHS[2], WIDTHS[1], WIDTHS[0]]
const PHONE_AND_DESKTOP = [WIDTHS[3], WIDTHS[0]]

for (const vp of PAYING_SUBS_WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`paying-subs home ${vp.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mockStripe(page, liveSummary("connected"))
      await openLive(page, "/home")
      await setTheme(page, theme)
      save(`home-${vp.width}-${theme}.png`, await capture(page))
    })

    test(`paying-subs metrics ${vp.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mockStripe(page, liveSummary("connected"))
      await openLive(page, "/metrics")
      await setTheme(page, theme)
      await expect(page.getByRole("note", { name: "Partly live" })).toBeVisible()
      await expect(page.locator("main header").first().getByTestId("sample-data-tag")).toHaveCount(0)
      save(`metrics-${vp.width}-${theme}.png`, await capture(page))
    })
  }
}

for (const vp of PHONE_AND_DESKTOP) {
  for (const theme of ["light", "dark"] as const) {
    test(`paying-subs ticker breakdown ${vp.width} ${theme} (tooltip open)`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mockStripe(page, liveSummary("connected"))
      await openLive(page, "/home")
      await setTheme(page, theme)
      const link = page.getByTestId("subscriber-ticker").filter({ visible: true }).getByRole("link")
      // A phone has no hover: the breakdown opens on keyboard focus there
      // (a real Tab, so it counts as keyboard focus).
      if (vp.width < 768) {
        await link.focus()
        await page.keyboard.press("Shift+Tab")
        await page.keyboard.press("Tab")
        await expect(link).toBeFocused()
      } else await link.hover()
      const tip = page.getByTestId("ticker-breakdown")
      await expect(tip).toBeVisible()
      await expect(tip).toContainText("Free (never paid)174")
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
      await page.waitForTimeout(300)
      // Not full page: the tooltip is anchored to the viewport's header.
      save(`ticker-breakdown-${vp.width}-${theme}.png`, await page.screenshot())
    })

    test(`paying-subs home ${vp.width} ${theme}, App Store not connected`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mockStripe(page, liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
      await openLive(page, "/home")
      await setTheme(page, theme)
      await expect(page.getByTestId("subscriber-breakdown-note").filter({ visible: true }).first()).toHaveText(
        "Total excludes App Store (not connected)"
      )
      save(`home-${vp.width}-${theme}-appstore-not-connected.png`, await capture(page))
    })
  }
}

/**
 * The App Store suspect-zero set (8 files): Stripe connected, the App
 * Store connected but reading 0 — the row warns ("Check source"), the
 * total leaves it out (1,284). Home at 390, 820, 1180 and 1440, both
 * themes. Mocked; run on its own into its own folder:
 *
 *   STRIPE_READONLY_KEY= SCREENSHOT_DIR=/workspace/hotdash-shots/appstore-zero pnpm screens:stripe-live -g appstore-zero
 */
for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`appstore-zero home ${vp.width} ${theme} (suspect)`, async ({ page }) => {
      await page.setViewportSize(vp)
      await mockStripe(page, liveSummary("connected", LIVE_METRICS, APP_STORE_ZERO))
      await openLive(page, "/home")
      await setTheme(page, theme)
      await expect(
        page.locator("[data-testid='subscriber-breakdown'] [data-row='appStore'][data-warning]").filter({ visible: true }).first()
      ).toContainText("Check source")
      save(`home-${vp.width}-${theme}-appstore-suspect.png`, await capture(page))
    })
  }
}
