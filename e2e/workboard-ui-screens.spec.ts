import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { vetUnmockedApi, writeShotShas } from "./support/shots"
import { MIN_TAP } from "./support/tap-target"
import { setTheme } from "./support/theme"
import {
  LIVE_ITEMS,
  WORKBOARD_STATES,
  WORKBOARD_URL,
  mockWorkboard,
  type WorkboardStateName,
} from "./support/workboard"

/**
 * Review stills for the Work board tab (queue item 4): every state at
 * 390/820/1180/1440, light and dark. The walk and its assertions run in
 * every e2e run (CI included), so the states it shoots stay true; PNGs are
 * written only with SCREENSHOTS=1, against a production build (the Next
 * portal is left visible). Fixture rows only (invented PRs); Not connected
 * is the real server, which has no GitHub token. Calls the spec does not
 * mock are vetted by vetUnmockedApi (no live data in a still). Stills stay
 * on the box, never in git.
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/workboard-ui-screens.spec.ts
 *
 * Names: `workboard-<state>-<width>-<theme>.png`. WORKBOARD_SHOT_STATES=live,empty
 * limits the states.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/workboard-ui-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

const ONLY = process.env.WORKBOARD_SHOT_STATES?.split(",").filter(Boolean) as WorkboardStateName[] | undefined
const STATES: WorkboardStateName[] = ONLY ?? (Object.keys(WORKBOARD_STATES) as WorkboardStateName[])

test.beforeAll(() => {
  if (CAPTURE) writeShotShas(OUT, `workboard stills (${process.env.SHOT_LABEL ?? "after"})`)
})

async function shoot(page: Page, name: string) {
  if (!CAPTURE) return
  await page.waitForTimeout(300)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

const board = (page: Page) => page.getByRole("tabpanel", { name: "Work board" })

async function expectState(page: Page, state: WorkboardStateName, width: number) {
  const b = board(page)
  switch (state) {
    case "connecting":
      await expect(b.getByTestId("workboard-connecting-badge")).toHaveText("Connecting…")
      await expect(b.getByTestId("work-card")).toHaveCount(0)
      return
    case "not_connected":
      await expect(b.getByTestId("workboard-not-connected").getByTestId("not-connected")).toHaveText("Not connected")
      await expect(b.getByTestId("work-card")).toHaveCount(0)
      return
    case "empty":
      await expect(b.getByTestId("workboard-empty")).toContainText("No open pull requests")
      await expect(b.getByTestId("work-card")).toHaveCount(0)
      return
    case "live":
    case "stale": {
      await expect(b.getByTestId("work-card")).toHaveCount(LIVE_ITEMS.length)
      await expect(b.getByTestId("workboard-stale")).toHaveCount(state === "stale" ? 1 : 0)
      if (width < 1280) {
        const box = await b.getByRole("link", { name: "PR #48" }).boundingBox()
        expect(box!.height, "PR link touch target").toBeGreaterThanOrEqual(MIN_TAP)
      }
      return
    }
  }
}

for (const state of STATES) {
  for (const vp of WIDTHS) {
    for (const theme of ["light", "dark"] as const) {
      test(`workboard ${state} ${vp.width} ${theme}`, async ({ page }) => {
        await page.setViewportSize(vp)
        const noLiveData = await vetUnmockedApi(page)
        const body = WORKBOARD_STATES[state]()
        if (body) await mockWorkboard(page, body)
        await page.goto(WORKBOARD_URL)
        await waitForHydration(page)
        await setTheme(page, theme)
        await expect(page.getByRole("tab", { name: "Work board" })).toHaveAttribute("aria-selected", "true")
        await expectState(page, state, vp.width)
        await shoot(page, `workboard-${state}-${vp.width}-${theme}`)
        noLiveData()
      })
    }
  }
}
