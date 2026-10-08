import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { resetDemoData } from "./support/persistence"

/**
 * Review stills for Home at the four target widths, both themes.
 * Opt-in against a production build so the Next.js dev “N” badge is absent:
 * `pnpm build && CI=true SCREENSHOTS=1 playwright test e2e/responsive-home-screens.spec.ts`
 * (or `pnpm screens:responsive-home` after a build).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/home"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORE_KEY = "hotdash.agent-workplace.v2"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

/** next-themes storage — used on phone where the rail theme toggle is unreachable. */
async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

async function closeLinkedTickets(page: Page) {
  const linked = [
    ["CHLK-408", "In Review"],
    ["CHLK-412", "Blocked"],
    ["CHLK-406", "In Progress"],
  ] as const
  for (const [key, status] of linked) {
    await page.goto(`/agent-workplace?issue=${key}`)
    await page.getByRole("button", { name: status, exact: true }).click()
    await page.getByRole("button", { name: "Done", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(
      page.locator('[data-slot="popover-trigger"]').filter({ hasText: /^Done$/ })
    ).toBeVisible()
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Home ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/home")
      await page.evaluate((key) => localStorage.removeItem(key), STORE_KEY)
      await forceTheme(page, theme)
      await expect(page.getByText("2 waiting")).toBeVisible()

      await shoot(page, `home-${size}-with-data-${theme}`)

      await page.goto("/agent-workplace?tab=backlog")
      await page.getByRole("button", { name: "Complete sprint" }).click()
      await page.goto("/home")
      await expect(page.getByText("No sprint is running")).toBeVisible()
      await shoot(page, `home-${size}-no-sprint-${theme}`)

      await closeLinkedTickets(page)
      await page.goto("/home")
      await expect(page.getByText("Nothing needs you")).toBeVisible()
      await expect(page.getByText("No sprint is running")).toBeVisible()
      await shoot(page, `home-${size}-empty-${theme}`)

      await page.goto("/agent-workplace")
      await resetDemoData(page)
      await page.goto("/home")
      await expect(page.getByText("2 waiting")).toBeVisible()
    })
  }
}
