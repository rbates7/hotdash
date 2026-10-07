import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for the Agent Workplace, every main state in both
 * themes at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens`). Output goes to docs/screenshots/agent-workplace and,
 * when SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/agent-workplace"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}


for (const theme of ["light", "dark"] as const) {
  test(`captures every Workplace state (${theme})`, async ({ page }) => {
    await page.goto("/agent-workplace")
    await page.evaluate(() => localStorage.removeItem("hotdash.agent-workplace.v2"))
    await page.reload()
    await setTheme(page, theme)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)

    // With data.
    await shoot(page, `workplace-issues-${theme}`)
    await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Agents" }).click()
    await shoot(page, `workplace-issues-filter-agents-${theme}`)
    await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "All" }).click()

    // Persistence label, close up.
    for (const dir of OUT_DIRS) {
      await page.locator("main header").first().screenshot({
        path: path.join(dir, `workplace-persistence-label-${theme}.png`),
      })
    }

    // Other tabs.
    for (const tab of ["Backlog", "Agents", "Chat", "Autopilots", "Inbox"] as const) {
      await page.getByRole("tab", { name: tab }).click()
      await shoot(page, `workplace-${tab.toLowerCase()}-${theme}`)
    }

    // Create-issue dialog.
    await page.getByRole("tab", { name: "Issues" }).click()
    await page.getByRole("button", { name: "New issue" }).click()
    await page.getByRole("textbox", { name: "Issue title" }).fill("Screenshot: a new issue")
    await shoot(page, `workplace-create-issue-${theme}`)
    await page.keyboard.press("Escape")

    // Ticket view: editing priority, editing project, then persisted after reload.
    await page.getByRole("button", { name: /Undo stack for iPad canvas/ }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()
    await shoot(page, `workplace-ticket-${theme}`)

    await page.getByRole("button", { name: "Priority: Urgent" }).click()
    await expect(page.getByRole("button", { name: "Low", exact: true })).toBeVisible()
    await shoot(page, `workplace-editing-priority-${theme}`)
    await page.getByRole("button", { name: "Low", exact: true }).click()
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Project: No project" }).click()
    await expect(page.getByRole("button", { name: "Billing", exact: true })).toBeVisible()
    await shoot(page, `workplace-editing-project-${theme}`)
    await page.getByRole("button", { name: "Billing", exact: true }).click()
    await page.keyboard.press("Escape")

    await page.reload()
    await expect(page.getByRole("button", { name: "Priority: Low" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Project: Billing" })).toBeVisible()
    await shoot(page, `workplace-ticket-persisted-after-reload-${theme}`)

    // Empty board: complete the sprint from the Backlog.
    await page.getByRole("button", { name: "Back to the board" }).click()
    await page.getByRole("tab", { name: "Backlog" }).click()
    await page.getByRole("button", { name: "Complete sprint" }).click()
    await page.getByRole("tab", { name: "Issues" }).click()
    await expect(page.getByText("No sprint is running")).toBeVisible()
    await shoot(page, `workplace-empty-${theme}`)

    // Back to the seed for the next run.
    await resetDemoData(page)
    await expect(page.getByText("3 agents working")).toBeVisible()
  })
}
