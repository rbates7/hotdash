import { expect, test, type Page } from "@playwright/test"

import {
  EMPTY_BUGS,
  EMPTY_BUGS_HINT,
  SENTRY_EMPTY,
  SENTRY_HINT,
  SENTRY_TITLE,
  WORKPLACE_KEY as STORAGE_KEY,
  freshBugs,
  seededBugs,
} from "./support/bugs"
import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { connectingInbox, emptyInbox, liveInbox, mockInbox } from "./support/inbox"
import {
  NOTE,
  countWrites,
  expectWritesSettled,
  persistenceNote,
  clearMyEntries,
} from "./support/persistence"
import { setTheme } from "./support/theme"

/** The old Workplace demo's bug tickets: no screen shows them any more. */
const SEED_BUG_KEYS = ["CHLK-404", "CHLK-419", "CHLK-420", "CHLK-421"] as const

const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard" })
const list = (page: Page) => page.getByRole("region", { name: "Bug list", exact: true })
const group = (page: Page, name: string) => list(page).getByRole("region", { name, exact: true })
const bug = (page: Page, key: string) => list(page).getByRole("link", { name: new RegExp(`\\b${key}\\b`) })
const crashCard = (page: Page) => page.getByRole("article", { name: "Crashes: not connected", exact: true })
const sentryOff = (page: Page) => page.getByRole("region", { name: `${SENTRY_TITLE}: not connected`, exact: true })
const sentry = (page: Page) => page.getByTestId("sentry-crashes")
const emptyStatus = (page: Page) => list(page).getByRole("status", { name: "Empty bug list" })
const props = (page: Page) => page.getByRole("complementary", { name: "Ticket properties" })
const pageHeader = (page: Page) => page.locator("main header").first()
const card = (page: Page, column: string, key: string) =>
  page.getByRole("region", { name: column, exact: true }).getByRole("button", { name: new RegExp(`\\b${key}\\b`) })

async function setStatus(page: Page, from: string, to: string) {
  await props(page).getByRole("button", { name: from, exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: to, exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(props(page).getByRole("button", { name: to, exact: true })).toBeVisible()
}

test.describe("Bugs", () => {
  test("is reachable from the sidebar; with no keys and no tickets of the founder's own it shows Sentry Not connected, the crash card and the empty list", async ({ page }) => {
    await page.goto("/home")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await rail(page).getByRole("link", { name: "Bugs", exact: true }).click()
    await expect(page).toHaveURL(/\/bugs$/)
    await expect(page.getByRole("heading", { level: 1, name: "Bugs" })).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "Bugs", exact: true })).toHaveAttribute("data-active")
    await expect(page.getByText("Yo-Yo's page. Coach-reported and crashes.")).toBeVisible()
    await expect(pageHeader(page).getByText("Dummy / design mock")).toHaveCount(0)

    // The e2e server has no Sentry token: /api/inbox says not connected, so
    // the Sentry list is the Not connected panel, never rows.
    await expect(sentryOff(page)).toBeVisible()
    await expect(sentryOff(page)).toHaveAttribute("data-testid", "sentry-not-connected")
    await expect(sentryOff(page)).toContainText("Not connected")
    await expect(sentryOff(page)).toContainText(SENTRY_TITLE)
    await expect(sentryOff(page)).toContainText(SENTRY_HINT)
    await expect(sentry(page)).toHaveCount(0)

    // Sentry is not connected: the crash card has no figure and no Sample label.
    await expect(crashCard(page)).toHaveAttribute("data-source", "not_connected")
    await expect(crashCard(page).getByTestId("crash-count")).toHaveText("—No figure")
    await expect(crashCard(page).getByTestId("crash-count").getByText("No figure", { exact: true })).toHaveClass(/\bsr-only\b/)
    await expect(crashCard(page).getByTestId("not-connected")).toHaveText("Not connected")
    await expect(crashCard(page).getByText(/no figure until Sentry is connected/)).toBeVisible()
    await expect(crashCard(page).getByText(/vs previous 7 days/)).toHaveCount(0)

    // Nothing of the founder's is saved and the board ships no tickets, so
    // the list is empty and says where bugs come from.
    await expect(list(page).getByText("0 open · 0 fixed")).toBeVisible()
    await expect(emptyStatus(page)).toContainText(EMPTY_BUGS)
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
    await expect(list(page).getByRole("heading", { level: 2 })).toHaveCount(0)
    await expect(list(page).getByRole("link")).toHaveCount(0)
    for (const key of SEED_BUG_KEYS) await expect(page.getByText(key, { exact: true })).toHaveCount(0)
    await expect(page.getByText("Crash opening a shared playbook on iPad")).toHaveCount(0)
    await expect(page.getByRole("note", { name: "Sample data" })).toHaveCount(0)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test("Sentry connected (mocked /api/inbox): its unresolved issues list as rows that open Sentry", async ({ page }) => {
    await mockInbox(page, liveInbox(Date.now()))
    await freshBugs(page)

    await expect(sentry(page)).toHaveAttribute("data-state", "connected")
    await expect(sentryOff(page)).toHaveCount(0)
    await expect(sentry(page).getByRole("heading", { level: 2, name: SENTRY_TITLE })).toBeVisible()
    const rows = sentry(page).getByRole("link")
    // Only the Sentry rows: the inbox's GitHub PRs stay on the Workplace Inbox.
    await expect(rows).toHaveCount(3)
    await expect(sentry(page).getByText("3", { exact: true })).toBeVisible()
    await expect(sentry(page).getByText(/PR ready for review|#912/)).toHaveCount(0)

    const first = rows.first()
    await expect(first).toContainText("Crash · New issue")
    await expect(first).toContainText("CHLK-IOS-4F Crash opening a practice plan · 12 events, 4 users")
    await expect(first).toHaveAttribute("href", "https://chlk.sentry.io/issues/7001/")
    await expect(first).toHaveAttribute("target", "_blank")
    await expect(first).toHaveAccessibleName(/\(opens Sentry\)$/)
    // Dated 95, 240 and 600 minutes back from now: default `ago` style.
    await expect(sentry(page).getByTestId("sentry-age")).toHaveText(["2h ago", "4h ago", "10h ago"])
    await expect(rows.nth(1)).toContainText("Error · Regressed")
    await expect(rows.nth(2)).toContainText("Error · Ongoing")

    // The weekly crash count still has no source, so the card stays honest.
    await expect(crashCard(page)).toHaveAttribute("data-source", "not_connected")
  })

  test("Sentry connected with nothing open, and while its first sync runs, shows no rows", async ({ page }) => {
    await mockInbox(page, emptyInbox(Date.now()))
    await freshBugs(page)
    await expect(sentry(page)).toHaveAttribute("data-state", "connected")
    await expect(sentry(page).getByRole("status")).toHaveText(SENTRY_EMPTY)
    await expect(sentry(page).getByRole("link")).toHaveCount(0)

    await page.unroute("**/api/inbox")
    await mockInbox(page, connectingInbox(Date.now()))
    await page.reload()
    await expect(sentry(page)).toHaveAttribute("data-state", "connecting")
    await expect(sentry(page).getByText("Connecting to Sentry… first sync in progress.")).toBeVisible()
    await expect(sentry(page).getByRole("link")).toHaveCount(0)
  })

  test("lists the founder's own bug tickets grouped by status; the old demo's bug keys never show", async ({ page }) => {
    await seededBugs(page)

    await expect(list(page).getByRole("heading", { level: 2 })).toHaveText([
      "To Do",
      "In Progress",
      "In Review",
      "Done",
    ])
    await expect(list(page).getByText("3 open · 1 fixed")).toBeVisible()
    await expect(group(page, "To Do").getByRole("link")).toHaveText([/Crash opening a shared playbook on iPad/])
    await expect(group(page, "In Progress").getByRole("link")).toHaveText([/Undo stack for iPad canvas/])
    await expect(group(page, "In Review").getByRole("link")).toHaveText([/Route arrows vanish after undo/])
    await expect(group(page, "Done").getByRole("link")).toHaveText([/Crash exporting a book to PDF/])
    await expect(emptyStatus(page)).toHaveCount(0)
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveCount(0)

    await expect(bug(page, "CHLK-919").getByTestId("bug-tag")).toHaveText("Bug · Crash")
    await expect(bug(page, "CHLK-920").getByTestId("bug-tag")).toHaveText("Bug · Coach-reported")
    await expect(bug(page, "CHLK-919")).toContainText("Yo-Yo")
    await expect(bug(page, "CHLK-919")).toContainText("Urgent")
    await expect(bug(page, "CHLK-919")).toHaveAttribute("href", "/bugs?issue=CHLK-919")
    // Saved five hours before the page's instant: default `ago` style.
    await expect(bug(page, "CHLK-919").getByTestId("bug-age")).toHaveText("5h ago")
    await expect(bug(page, "CHLK-904").getByTestId("bug-age")).toHaveText("17h ago")
    await expect(bug(page, "CHLK-921").getByTestId("bug-age")).toHaveText("4d ago")

    // Only the founder's bug tickets; none of the old demo's keys.
    await expect(list(page).getByRole("link")).toHaveCount(4)
    for (const key of SEED_BUG_KEYS) await expect(bug(page, key)).toHaveCount(0)
    await expect(list(page).getByRole("note", { name: "Sample data" })).toHaveCount(0)
  })

  test("a fresh Agent Workplace board has no demo tickets, and /bugs?issue=CHLK-419 opens nothing", async ({ page }) => {
    await freshBugs(page, "/agent-workplace")
    await expect(page.getByText("No sprint is running")).toBeVisible()
    for (const key of SEED_BUG_KEYS) await expect(page.getByText(key, { exact: true })).toHaveCount(0)
    await page.goto("/bugs?issue=CHLK-419")
    await expect(page.getByText("Issue CHLK-419 not found")).toBeVisible()
    await page.goto("/agent-workplace")

    // …and Bugs, reading the same board, lists none.
    await rail(page).getByRole("link", { name: "Bugs", exact: true }).click()
    await expect(page).toHaveURL(/\/bugs$/)
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
    await expect(list(page).getByRole("link")).toHaveCount(0)
  })

  test("happy path: a bug opens its ticket, a status edit here shows on the Workplace board, a ticket created and tagged there shows here, Clear removes the bugs only", async ({ page }) => {
    await seededBugs(page)

    await bug(page, "CHLK-919").click()
    await expect(page).toHaveURL(/\/bugs\?issue=CHLK-919$/)
    await expect(page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeVisible()
    await expect(page.getByTestId("bug-tag")).toHaveText("Bug · Crash")
    await expect(props(page).getByRole("button", { name: "Untag bug", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await setStatus(page, "To Do", "Blocked")
    await props(page).getByRole("button", { name: /Yo-Yo/ }).click()
    await page.getByRole("dialog").getByRole("button", { name: "May" }).click()
    await page.keyboard.press("Escape")
    await expect(props(page).getByRole("button", { name: /May/ })).toBeVisible()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)

    await page.getByRole("button", { name: "Back to Bugs", exact: true }).click()
    await expect(page).toHaveURL(/\/bugs$/)
    await expect(group(page, "Blocked").getByRole("link")).toHaveText([/Crash opening a shared playbook on iPad/])
    await expect(list(page).getByRole("region", { name: "To Do", exact: true })).toHaveCount(0)
    await expect(bug(page, "CHLK-919")).toContainText("May")

    await rail(page).getByRole("link", { name: "Agent Workplace", exact: true }).click()
    const moved = card(page, "Blocked", "CHLK-919")
    await expect(moved).toBeVisible()
    await expect(moved).toContainText("May")
    await expect(moved.getByTestId("bug-tag")).toHaveText("Bug")
    await expect(card(page, "To Do", "CHLK-919")).toHaveCount(0)

    // A ticket the founder files and tags on the board is a bug of their own.
    await page.getByRole("button", { name: "New issue" }).click()
    await page.getByRole("textbox", { name: "Issue title" }).fill("Roster sync drops a coach's email")
    await page.getByRole("button", { name: /^Create Issue/ }).click()
    const filed = card(page, "To Do", "CHLK-922")
    await expect(filed).toContainText("Roster sync drops a coach's email")
    await filed.click()
    await expect(page).toHaveURL(/issue=CHLK-922/)
    await props(page).getByRole("button", { name: "Tag as bug", exact: true }).click()
    await expect(props(page).getByRole("button", { name: "Untag bug", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(page.getByTestId("bug-tag")).toHaveText("Bug · Coach-reported")

    await rail(page).getByRole("link", { name: "Bugs", exact: true }).click()
    await expect(list(page).getByText("4 open · 1 fixed")).toBeVisible()
    await expect(group(page, "To Do").getByRole("link")).toHaveText([/Roster sync drops a coach's email/])
    await expect(bug(page, "CHLK-922").getByTestId("bug-tag")).toHaveText("Bug · Coach-reported")

    // Clear on Bugs deletes the founder's bug tickets; the board's other tickets stay.
    await clearMyEntries(page, pageHeader(page))
    await expect(list(page).getByText("0 open · 0 fixed")).toBeVisible()
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
    await expect(bug(page, "CHLK-922")).toHaveCount(0)
    await expect(bug(page, "CHLK-919")).toHaveCount(0)
    const rest = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(rest).not.toContain('"CHLK-919"')
    expect(rest).toContain('"CHLK-902"')
  })

  test("two tabs: a status edit on Bugs reaches an open Workplace board, with one write", async ({ context }) => {
    await countWrites(context, STORAGE_KEY)
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)

    const bugs = await context.newPage()
    const board = await context.newPage()
    // The seeding write happens before the reload, so the counter starts at 0.
    await seededBugs(bugs, "/bugs?issue=CHLK-920")
    await board.goto("/agent-workplace")
    await expect(persistenceNote(board)).toHaveText(NOTE.saved)
    await expect(card(board, "In Review", "CHLK-920")).toContainText("Route arrows vanish after undo")
    await settled(bugs, 0)
    await settled(board, 0)

    await setStatus(bugs, "In Review", "Done")
    await expect(persistenceNote(bugs)).toHaveText(NOTE.saved)
    await expect(card(board, "Done", "CHLK-920")).toBeVisible()
    await expect(card(board, "In Review", "CHLK-920")).toHaveCount(0)
    await expect(persistenceNote(board)).toHaveText(NOTE.saved)
    await settled(bugs, 1)
    await settled(board, 0)

    // The Workplace's Clear there deletes its tickets and sprints, never a bug:
    // the bug stays open here, Done, and this tab writes nothing.
    await clearMyEntries(board, board.locator("main header").first())
    await expect(props(bugs).getByRole("button", { name: "Done", exact: true })).toBeVisible()
    await expect(persistenceNote(bugs)).toHaveText(NOTE.saved)
    await settled(bugs, 1)
    await settled(board, 1)
  })

  test("every open bug fixed reads 'No open bugs' while the fixed ones stay listed", async ({ page }) => {
    await seededBugs(page)
    for (const [key, from] of [
      ["CHLK-919", "To Do"],
      ["CHLK-904", "In Progress"],
      ["CHLK-920", "In Review"],
    ] as const) {
      await page.goto(`/bugs?issue=${key}`)
      await setStatus(page, from, "Done")
    }
    await page.goto("/bugs")
    await expect(emptyStatus(page)).toHaveText(EMPTY_BUGS)
    // The founder has bugs (all fixed), so no "tag a ticket" hint.
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveCount(0)
    await expect(list(page).getByText("0 open · 4 fixed")).toBeVisible()
    await expect(list(page).getByRole("heading", { level: 2 })).toHaveText(["Done"])
    await expect(group(page, "Done").getByRole("link")).toHaveCount(4)

    await clearMyEntries(page, pageHeader(page))
    await expect(list(page).getByText("0 open · 0 fixed")).toBeVisible()
    await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
  })

  test("every text node reads at ≥ 4.5:1 in both themes, solid, no opacity", async ({ page }) => {
    // Nothing saved: the Sentry panel and the empty list with its hint.
    await freshBugs(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(page.getByRole("heading", { level: 1, name: "Bugs" }), `${theme}/title`, expect)
      await expectReadable(crashCard(page), `${theme}/crash card`, expect)
      const panel = await expectReadable(sentryOff(page), `${theme}/sentry not connected`, expect)
      expect(panel.some((n) => n.text === SENTRY_HINT), `${theme}: measured the Sentry hint`).toBe(true)
      const empty = await expectReadable(list(page), `${theme}/empty bug list`, expect)
      expect(empty.some((n) => n.text === EMPTY_BUGS_HINT), `${theme}: measured the empty hint`).toBe(true)
    }

    // The founder's own bugs: every group heading and both chip sources.
    await seededBugs(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const nodes = await expectReadable(list(page), `${theme}/bug list`, expect)
      for (const heading of ["To Do", "In Progress", "In Review", "Done"]) {
        expect(nodes.some((n) => n.text === heading), `${theme}: measured "${heading}"`).toBe(true)
      }
      expect(nodes.some((n) => n.text === "Bug · Crash")).toBe(true)
      expect(nodes.some((n) => n.text === "Bug · Coach-reported")).toBe(true)

      await bug(page, "CHLK-919").click()
      await expect(page).toHaveURL(/issue=CHLK-919/)
      await expect(
        page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })
      ).toBeVisible()
      const chip = page.getByTestId("bug-tag")
      await expect(chip).toHaveCount(1)
      await expectReadable(chip, `${theme}/ticket chip`, expect)
      await expectReadable(
        props(page).getByRole("button", { name: "Untag bug", exact: true }),
        `${theme}/bug toggle`,
        expect
      )
      await page.getByRole("button", { name: "Back to Bugs", exact: true }).click()
      await expect(list(page)).toBeVisible()
    }
    await setTheme(page, "light")
  })

  test("Sentry rows read at ≥ 4.5:1 in both themes", async ({ page }) => {
    await mockInbox(page, liveInbox(Date.now()))
    await freshBugs(page)
    await expect(sentry(page)).toHaveAttribute("data-state", "connected")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const nodes = await expectReadable(sentry(page), `${theme}/sentry rows`, expect)
      expect(nodes.some((n) => n.text === "Crash · New issue"), `${theme}: measured a row title`).toBe(true)
      expect(nodes.some((n) => n.text === "2h ago"), `${theme}: measured a row age`).toBe(true)
    }
    await setTheme(page, "light")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await seededBugs(page)
    await expectProbeCatchesSabotage(crashCard(page), "crash card", expect)
    await expectProbeCatchesSabotage(sentryOff(page), "sentry panel", expect)
    await expectProbeCatchesSabotage(bug(page, "CHLK-919"), "bug row", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(group(page, "Done"), "Done group (dark)", expect)
    await setTheme(page, "light")
  })
})
