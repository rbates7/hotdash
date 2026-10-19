import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { INBOX_STATES, mockInbox, type InboxStateName } from "./support/inbox"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for the live Inbox: Home's "Needs you" door and the
 * Workplace Inbox tab, every state, four widths, light and dark. Run
 * against a production build; the Next portal is left visible. Fixture
 * data only (invented PRs and issues).
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/inbox-screens.spec.ts
 *
 * INBOX_SHOTS_BEFORE=1 shoots the base branch once per surface (it has no
 * /api/inbox, so the mock is not installed and every state looks the same).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/inbox-shots")
const BEFORE = Boolean(process.env.INBOX_SHOTS_BEFORE)
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const
const SURFACES = [
  { name: "home", path: "/home" },
  { name: "inbox", path: "/agent-workplace?tab=inbox" },
] as const
const STATES: (InboxStateName | "before")[] = BEFORE ? ["before"] : (Object.keys(INBOX_STATES) as InboxStateName[])

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(300)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

for (const state of STATES) {
  for (const vp of WIDTHS) {
    test(`${state} at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp)
      if (state !== "before") await mockInbox(page, INBOX_STATES[state](Date.now()))
      for (const surface of SURFACES) {
        await page.goto(surface.path)
        await waitForHydration(page)
        if (state !== "before") {
          const target = surface.name === "home" ? page.getByTestId("needs-you-state") : page.getByTestId("inbox-panel")
          await expect(target).toHaveAttribute("data-state", state === "empty" ? "connected" : state)
        } else {
          await page.waitForLoadState("networkidle")
        }
        for (const theme of ["light", "dark"] as const) {
          await setTheme(page, theme)
          await shoot(page, `${surface.name}-${state}-${vp.width}-${theme}`)
        }
      }
    })
  }
}
