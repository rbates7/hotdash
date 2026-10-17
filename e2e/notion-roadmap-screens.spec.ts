import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { liveRoadmapSummary, mockNotion } from "./support/notion"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for the Roadmap from Notion, against a production build so
 * the dev badge is absent. Connected uses a mocked /api/notion/roadmap
 * (fixture rows, never real Notion data); not connected is the real server
 * with no token.
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/notion-roadmap-screens.spec.ts
 *
 * Files: roadmap-<width>-<theme>-<not-connected|connected>.png
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/notion-roadmap-shots")

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

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`Roadmap stills ${vp.width} ${theme}`, () => {
      test.use({ viewport: vp })

      test("not connected", async ({ page }) => {
        await page.goto("/product-roadmap")
        await waitForHydration(page)
        await setTheme(page, theme)
        await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
        await expect(page.getByRole("article").first()).toBeVisible()
        fs.mkdirSync(OUT, { recursive: true })
        fs.writeFileSync(path.join(OUT, `roadmap-${vp.width}-${theme}-not-connected.png`), await capture(page))
      })

      test("connected", async ({ page }) => {
        await mockNotion(page, liveRoadmapSummary("connected"))
        await page.goto("/product-roadmap")
        await waitForHydration(page)
        await setTheme(page, theme)
        await expect(page.getByRole("status", { name: "Where the roadmap comes from" }).first()).toHaveText(
          "Read-only · from Notion"
        )
        await expect(page.getByRole("article", { name: "Coach onboarding v2" })).toBeVisible()
        fs.mkdirSync(OUT, { recursive: true })
        fs.writeFileSync(path.join(OUT, `roadmap-${vp.width}-${theme}-connected.png`), await capture(page))
      })
    })
  }
}
