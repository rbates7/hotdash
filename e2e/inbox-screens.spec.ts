import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { INBOX_STATES, mockInbox, type InboxStateName } from "./support/inbox"
import { waitForHydration } from "./support/shell"
import { vetUnmockedApi, writeShotShas } from "./support/shots"
import { setTheme } from "./support/theme"

/**
 * Review stills for the live Inbox: Home's "Needs you" door and the
 * Workplace Inbox tab, every state, four widths, light and dark. Run
 * against a production build; the Next portal is left visible. Fixture
 * data only (invented PRs and issues).
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/inbox-screens.spec.ts
 *
 * INBOX_SHOT_STATES=mixed,connected limits the states shot.
 *
 * Before shots come from `e2e/inbox-before-shots.spec.ts`. Calls the spec
 * does not mock are vetted by vetUnmockedApi (no live data in a still).
 * Both write SHAS.txt beside the stills naming the commit served;
 * `scripts/inbox-reshoot.sh` runs the pair against production builds of
 * develop and the head. Stills stay on the box.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/inbox-shots")
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
const ONLY = process.env.INBOX_SHOT_STATES?.split(",").filter(Boolean) as InboxStateName[] | undefined
const STATES: InboxStateName[] = ONLY ?? (Object.keys(INBOX_STATES) as InboxStateName[])

test.beforeAll(() => writeShotShas(OUT, "inbox stills (after)"))

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(300)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

for (const state of STATES) {
  for (const vp of WIDTHS) {
    test(`${state} at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp)
      const noLiveData = await vetUnmockedApi(page)
      await mockInbox(page, INBOX_STATES[state](Date.now()))
      for (const surface of SURFACES) {
        await page.goto(surface.path)
        await waitForHydration(page)
        const target = surface.name === "home" ? page.getByTestId("needs-you-state") : page.getByTestId("inbox-panel")
        await expect(target).toHaveAttribute("data-state", state === "empty" || state === "mixed" ? "connected" : state)
        for (const theme of ["light", "dark"] as const) {
          await setTheme(page, theme)
          await shoot(page, `${surface.name}-${state}-${vp.width}-${theme}`)
        }
      }
      noLiveData()
    })
  }
}
