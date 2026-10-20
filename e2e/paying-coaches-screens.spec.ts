import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { livePaying, mockPaying } from "./support/paying"
import { waitForHydration } from "./support/shell"
import { vetUnmockedApi } from "./support/shots"
import { setTheme } from "./support/theme"

/**
 * Review stills for #67: Home with the Paying coaches tile, four widths, both
 * themes. STATE: not-connected (real key-less server, nothing mocked),
 * connecting, connected, stale (mocked from fixtures, never real data).
 * SCREENSHOT_TAG before (develop) / after (head). Production builds only:
 * each shot asserts there is no Next.js portal. See
 * scripts/paying-coaches-reshoot.sh. Stills stay on the box.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/paying-coaches-shots")
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
  if (STATE === "connecting") return mockPaying(page, { status: "connecting" })
  return mockPaying(page, livePaying(STATE === "stale" ? "stale" : "connected"))
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`home ${TAG} ${STATE} ${vp.width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(vp)
      const noLiveData = await vetUnmockedApi(page)
      await mock(page)
      await page.goto("/")
      await waitForHydration(page)
      await setTheme(page, theme)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      if (TAG === "after") {
        const want = { "not-connected": "not_connected", connecting: "loading", connected: "live", stale: "live" }[STATE]
        await expect(page.getByTestId("paying-coaches")).toHaveAttribute("data-source", want ?? "")
      }
      await expect(page.locator("nextjs-portal")).toHaveCount(0)
      await page.waitForTimeout(400)
      fs.mkdirSync(OUT, { recursive: true })
      const suffix = STATE === "not-connected" ? "" : `-${STATE}`
      await page.screenshot({ path: path.join(OUT, `home-${vp.width}-${theme}-${TAG}${suffix}.png`), fullPage: true })
      noLiveData()
    })
  }
}
