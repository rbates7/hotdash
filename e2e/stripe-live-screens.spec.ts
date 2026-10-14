import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { liveSummary, mockStripe } from "./support/stripe"
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

test("metrics 1440 light (connected)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStripe(page, liveSummary("connected"))
  await openLive(page, "/metrics")
  await setTheme(page, "light")
  save("metrics-1440-light.png", await capture(page))
})

test("settings 1440 light (connected)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStripe(page, liveSummary("connected"))
  await page.goto("/settings")
  await waitForHydration(page)
  await setTheme(page, "light")
  await expect(page.getByTestId("stripe-status")).toHaveText("Connected")
  await page.getByRole("region", { name: "Connected data" }).scrollIntoViewIfNeeded()
  save("settings-1440-light.png", await capture(page))
})

test("not connected 1440 light (no key: Home + Settings)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/home")
  await waitForHydration(page)
  await setTheme(page, "light")
  await expect(page.getByRole("article", { name: "Subscribers", exact: true })).toHaveAttribute("data-source", "sample")
  const home = await capture(page)
  await page.goto("/settings")
  await waitForHydration(page)
  await expect(
    page.getByRole("region", { name: "Connected data" }).getByText("Not connected", { exact: true })
  ).toHaveCount(4)
  const settings = await capture(page)
  save("not-connected-home-1440-light.png", home)
  save("not-connected-settings-1440-light.png", settings)
  save("not-connected-1440-light.png", await sideBySide(page, home, settings))
})

test("stale 1440 light (Home + Settings)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStripe(page, liveSummary("stale"))
  await openLive(page, "/home")
  await setTheme(page, "light")
  await expect(page.getByTestId("kpi-updated").first()).toBeVisible()
  const home = await capture(page)
  await page.goto("/settings")
  await waitForHydration(page)
  await expect(page.getByTestId("stripe-status")).toContainText("Last updated")
  const settings = await capture(page)
  save("stale-home-1440-light.png", home)
  save("stale-settings-1440-light.png", settings)
  save("stale-1440-light.png", await sideBySide(page, home, settings))
})
