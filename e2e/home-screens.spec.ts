import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review screenshots for Home, every state in both themes at desktop width.
 * Opt-in: `SCREENSHOTS=1 pnpm test:e2e e2e/home-screens.spec.ts` (or
 * `pnpm screens:home`). Output goes to docs/screenshots/home and, when
 * SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/home"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORE_KEY = "hotdash.agent-workplace.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

async function setTheme(page: Page, theme: "light" | "dark") {
  // Through the real provider: click the sidebar toggle, not a query param.
  await page.getByText(theme === "dark" ? "Dark" : "Light", { exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

/** Close the three tickets Needs-you points at, through the ticket view. */
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
  test(`captures every Home state (${theme})`, async ({ page }) => {
    await page.goto("/home")
    await page.evaluate((key) => localStorage.removeItem(key), STORE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(page.getByText("2 waiting")).toBeVisible()

    // With data: the seed board and inbox.
    await shoot(page, `home-with-data-${theme}`)

    // Interactive: hovering a door and a Needs-you row.
    await page.getByRole("link", { name: "Open Agent Workplace" }).hover()
    await shoot(page, `home-door-hover-${theme}`)
    await page.getByRole("link", { name: /Agent blocked/ }).hover()
    await shoot(page, `home-needs-you-row-hover-${theme}`)
    await page.mouse.move(0, 0)

    // Half empty: the sprint is done but tickets still wait.
    await page.goto("/agent-workplace?tab=backlog")
    await page.getByRole("button", { name: "Complete sprint" }).click()
    await page.goto("/home")
    await expect(page.getByText("No sprint is running")).toBeVisible()
    await shoot(page, `home-no-sprint-${theme}`)

    // Empty: nothing running, nothing waiting.
    await closeLinkedTickets(page)
    await page.goto("/home")
    await expect(page.getByText("Nothing needs you")).toBeVisible()
    await expect(page.getByText("No sprint is running")).toBeVisible()
    await shoot(page, `home-empty-${theme}`)

    // Back to the seed for the next run.
    await page.goto("/agent-workplace")
    await page.getByRole("button", { name: "Reset" }).click()
    await page.goto("/home")
    await expect(page.getByText("2 waiting")).toBeVisible()
  })
}
