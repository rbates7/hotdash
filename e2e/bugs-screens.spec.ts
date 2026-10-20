import fs from "node:fs"
import path from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { EMPTY_BUGS, EMPTY_BUGS_HINT, SENTRY_TITLE, freshBugs, seededBugs } from "./support/bugs"
import { settleAnimations } from "./support/contrast"
import { liveInbox, mockInbox } from "./support/inbox"
import { clearMyEntries } from "./support/persistence"
import { vetUnmockedApi, writeShotShas } from "./support/shots"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for the Bugs page, every main state in both themes
 * at desktop width. The walk and its assertions run in every e2e run (CI
 * included), so the states it shoots stay true; the PNGs are written only
 * with SCREENSHOTS=1 (`pnpm screens:bugs`, CI=true so Playwright starts the
 * production server). Output goes to docs/screenshots/bugs and, when
 * SCREENSHOT_DIR is set, there as well. The Next portal is left visible.
 *
 * States: nothing connected and nothing of the founder's own (Sentry Not
 * connected, the empty list and its hint); Sentry live (mocked
 * /api/inbox, invented issues); the founder's own bug tickets (a saved
 * Workplace copy); a ticket open on Bugs and on the board; every bug fixed.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/bugs"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeAll(() => {
  if (CAPTURE) for (const dir of OUT_DIRS) writeShotShas(dir, "bugs stills")
})

async function shoot(page: Page, name: string, locator?: Locator) {
  if (!CAPTURE) return
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    if (locator) {
      await locator.screenshot({ path: path.join(dir, `${name}.png`) })
    } else {
      await page.screenshot({ path: path.join(dir, `${name}.png`) })
    }
  }
}

const list = (page: Page) => page.getByRole("region", { name: "Bug list", exact: true })
const props = (page: Page) => page.getByRole("complementary", { name: "Ticket properties" })
const crashCard = (page: Page) => page.getByRole("article", { name: "Crashes: not connected", exact: true })

for (const theme of ["light", "dark"] as const) {
  test(`captures every Bugs state (${theme})`, async ({ page }) => {
    // A still must never show live data: any /api call not mocked below is vetted.
    const noLiveData = CAPTURE ? await vetUnmockedApi(page) : () => undefined

    // Nothing connected, nothing saved: Sentry's Not connected panel and the
    // empty list with its hint. No seed bug anywhere.
    await freshBugs(page)
    await setTheme(page, theme)
    await expect(crashCard(page).getByTestId("crash-count")).toHaveText("—No figure")
    await expect(crashCard(page).getByTestId("not-connected")).toHaveText("Not connected")
    const sentryOff = page.getByTestId("sentry-not-connected")
    await expect(sentryOff).toContainText(SENTRY_TITLE)
    await expect(list(page).getByRole("status", { name: "Empty bug list" })).toContainText(EMPTY_BUGS)
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
    await expect(list(page).getByRole("link")).toHaveCount(0)
    await shoot(page, `bugs-not-connected-${theme}`)
    await shoot(page, `bugs-crash-card-${theme}`, crashCard(page))
    await shoot(page, `bugs-sentry-not-connected-${theme}`, sentryOff)

    // The founder's own bug tickets, from a saved Workplace copy.
    await seededBugs(page)
    await setTheme(page, theme)
    await expect(list(page).getByText("3 open · 1 fixed")).toBeVisible()
    await expect(list(page).getByRole("link")).toHaveCount(4)
    await expect(list(page).getByRole("link", { name: /\bCHLK-419\b/ })).toHaveCount(0)
    await shoot(page, `bugs-list-${theme}`)

    // Ticket open on Bugs — the Workplace TicketView, editing in place.
    await list(page).getByRole("link", { name: /\bCHLK-919\b/ }).click()
    await expect(page).toHaveURL(/\/bugs\?issue=CHLK-919/)
    await expect(page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeVisible()
    await expect(props(page).getByRole("button", { name: "Untag bug" })).toBeVisible()
    await shoot(page, `bugs-ticket-${theme}`)

    // The same ticket on the Workplace board, so the tag is visible there too.
    await page.goto("/agent-workplace?issue=CHLK-919")
    await expect(page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeVisible()
    await expect(props(page).getByRole("button", { name: "Untag bug" })).toBeVisible()
    await expect(page.getByTestId("bug-tag")).toHaveText("Bug · Crash")
    await shoot(page, `bugs-workplace-ticket-${theme}`)

    // Every open bug fixed: "No open bugs", the fixed ones still listed.
    for (const [key, from] of [
      ["CHLK-919", "To Do"],
      ["CHLK-904", "In Progress"],
      ["CHLK-920", "In Review"],
    ] as const) {
      await page.goto(`/bugs?issue=${key}`)
      await props(page).getByRole("button", { name: from, exact: true }).click()
      await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
      await page.keyboard.press("Escape")
      await expect(props(page).getByRole("button", { name: "Done", exact: true })).toBeVisible()
    }
    await page.goto("/bugs")
    await expect(list(page).getByRole("status", { name: "Empty bug list" })).toHaveText(EMPTY_BUGS)
    await expect(list(page).getByText("0 open · 4 fixed")).toBeVisible()
    await shoot(page, `bugs-all-fixed-${theme}`)

    // Clear my entries deletes the founder's bugs: back to the empty list and its hint.
    await clearMyEntries(page, page.locator("main header").first())
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
    noLiveData()
  })

  test(`captures Sentry connected (${theme})`, async ({ page }) => {
    const noLiveData = CAPTURE ? await vetUnmockedApi(page) : () => undefined
    // Mocked after the vet so the newest route (this one) answers /api/inbox.
    await mockInbox(page, liveInbox(Date.now()))
    await freshBugs(page)
    await setTheme(page, theme)
    const sentry = page.getByTestId("sentry-crashes")
    await expect(sentry).toHaveAttribute("data-state", "connected")
    await expect(sentry.getByRole("link")).toHaveCount(3)
    await expect(page.getByTestId("sentry-not-connected")).toHaveCount(0)
    await shoot(page, `bugs-sentry-live-${theme}`)
    await shoot(page, `bugs-sentry-rows-${theme}`, sentry)
    noLiveData()
  })
}
