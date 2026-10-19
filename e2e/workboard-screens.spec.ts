import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review stills for #51 at the four target widths, both themes: Agent
 * Workplace (unchanged by #51) and `GET /api/workboard` as a browser shows
 * it. The test server has no GitHub token, so the endpoint answers "not
 * connected" here (on develop it does not exist: 404). With
 * `WORKBOARD_REPLAY=<file.json>` the endpoint is answered from a saved
 * response (e.g. the preview's connected one) instead. Opt-in, against a
 * production build so the dev badge is absent:
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… SCREENSHOT_TAG=after \
 *     pnpm exec playwright test e2e/workboard-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "screenshots/workboard")
const TAG = process.env.SCREENSHOT_TAG ?? "after"
const REPLAY = process.env.WORKBOARD_REPLAY

const SIZES = {
  "390": { width: 390, height: 844 },
  "820": { width: 820, height: 1180 },
  "1180": { width: 1180, height: 820 },
  "1440": { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string, fullPage = true) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(250)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
}

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`workboard ${TAG} ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/agent-workplace")
      await forceTheme(page, theme)
      await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
      await shoot(page, `agent-workplace-${size}-${theme}-${TAG}`)

      if (REPLAY) {
        const body = fs.readFileSync(REPLAY, "utf8")
        await page.route("**/api/workboard", (route) =>
          route.fulfill({ status: 200, contentType: "application/json", body })
        )
      }
      // The JSON page takes the theme from the browser's colour scheme.
      await page.emulateMedia({ colorScheme: theme })
      const res = await page.goto("/api/workboard")
      if (TAG === "before") expect(res?.status()).toBe(404)
      else {
        expect(res?.status()).toBe(200)
        await expect(page.locator("body")).toContainText('"connected"')
      }
      await shoot(page, `api-workboard-${size}-${theme}-${TAG}`, false)
    })
  }
}
