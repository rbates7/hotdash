import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import {
  NOTE,
  countWrites,
  expectWritesSettled,
  persistenceNote,
  resetDemoData,
} from "./support/persistence"
import { setTheme } from "./support/theme"

/** Bugs has no key of its own: it reads and writes the Workplace's. */
const STORAGE_KEY = "hotdash.agent-workplace.v2"

const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard" })
const list = (page: Page) => page.getByRole("region", { name: "Bug list", exact: true })
const group = (page: Page, name: string) => list(page).getByRole("region", { name, exact: true })
const bug = (page: Page, key: string) => list(page).getByRole("link", { name: new RegExp(`\\b${key}\\b`) })
const crashCard = (page: Page) => page.getByRole("article", { name: "Crashes", exact: true })
const props = (page: Page) => page.getByRole("complementary", { name: "Ticket properties" })
const pageHeader = (page: Page) => page.locator("main header").first()

async function freshBugs(page: Page, path = "/bugs") {
  await page.goto(path)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  await expect(pageHeader(page).getByRole("button", { name: "Reset", exact: true })).toBeDisabled()
}

async function setStatus(page: Page, from: string, to: string) {
  await props(page).getByRole("button", { name: from, exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: to, exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(props(page).getByRole("button", { name: to, exact: true })).toBeVisible()
}

test.describe("Bugs", () => {
  test("is reachable from the sidebar and shows the Workplace's bugs grouped by status, plus the crash card", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "Bugs", exact: true }).click()
    await expect(page).toHaveURL(/\/bugs$/)
    await expect(page.getByRole("heading", { level: 1, name: "Bugs" })).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "Bugs", exact: true })).toHaveAttribute("data-active")
    await expect(page.getByText("Yo-Yo's page. Coach-reported and crashes.")).toBeVisible()

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

    await expect(bug(page, "CHLK-419").getByTestId("bug-tag")).toHaveText("Bug · Crash")
    await expect(bug(page, "CHLK-420").getByTestId("bug-tag")).toHaveText("Bug · Coach-reported")
    await expect(bug(page, "CHLK-419")).toContainText("Yo-Yo")
    await expect(bug(page, "CHLK-419")).toContainText("Urgent")
    // Seeded five hours before the page's instant: default `ago` style.
    await expect(bug(page, "CHLK-419").getByTestId("bug-age")).toHaveText("5h ago")
    await expect(bug(page, "CHLK-404").getByTestId("bug-age")).toHaveText("17h ago")
    await expect(bug(page, "CHLK-421").getByTestId("bug-age")).toHaveText("4d ago")

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    await expect(crashCard(page).getByTestId("crash-count")).toHaveText("8")
    await expect(crashCard(page).getByText("−7 vs previous 7 days")).toBeVisible()
    await expect(crashCard(page).getByTestId("sample-data-tag")).toHaveText("Sample data")
    await expect(crashCard(page).getByText(/Sentry not connected/)).toBeVisible()
    await expect(list(page).getByRole("note", { name: "Sample data" })).toBeVisible()
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(1)
  })

  test("happy path: a bug opens its ticket, a status edit here shows on the Workplace board, a tag there shows here, Reset puts the seed back", async ({ page }) => {
    await freshBugs(page)

    await bug(page, "CHLK-419").click()
    await expect(page).toHaveURL(/\/bugs\?issue=CHLK-419$/)
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
    await expect(bug(page, "CHLK-419")).toContainText("May")

    await rail(page).getByRole("link", { name: "Agent Workplace", exact: true }).click()
    const blocked = page.getByRole("region", { name: "Blocked", exact: true })
    const card = blocked.getByRole("button", { name: /Crash opening a shared playbook on iPad/ })
    await expect(card).toBeVisible()
    await expect(card).toContainText("May")
    await expect(card.getByTestId("bug-tag")).toHaveText("Bug")
    await expect(
      page.getByRole("region", { name: "To Do", exact: true }).getByText("Crash opening a shared playbook on iPad")
    ).toHaveCount(0)

    await page.getByRole("button", { name: /Copy-link expires after 7 days/ }).click()
    await expect(page).toHaveURL(/issue=CHLK-402/)
    await props(page).getByRole("button", { name: "Tag as bug", exact: true }).click()
    await expect(props(page).getByRole("button", { name: "Untag bug", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(page.getByTestId("bug-tag")).toHaveText("Bug · Coach-reported")

    await rail(page).getByRole("link", { name: "Bugs", exact: true }).click()
    await expect(list(page).getByText("4 open · 1 fixed")).toBeVisible()
    await expect(group(page, "To Do").getByRole("link")).toHaveText([/Copy-link expires after 7 days/])
    await expect(bug(page, "CHLK-402").getByTestId("bug-tag")).toHaveText("Bug · Coach-reported")

    await resetDemoData(page, pageHeader(page))
    await expect(list(page).getByText("3 open · 1 fixed")).toBeVisible()
    await expect(bug(page, "CHLK-402")).toHaveCount(0)
    await expect(group(page, "To Do").getByRole("link")).toHaveText([/Crash opening a shared playbook on iPad/])
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test("two tabs: a status edit on Bugs reaches an open Workplace board, with one write", async ({ context }) => {
    await countWrites(context, STORAGE_KEY)
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)

    const bugs = await context.newPage()
    const board = await context.newPage()
    await freshBugs(bugs, "/bugs?issue=CHLK-420")
    await board.goto("/agent-workplace")
    await expect(persistenceNote(board)).toHaveText(NOTE.unsaved)
    const review = board.getByRole("region", { name: "In Review", exact: true })
    await expect(review.getByRole("button", { name: /Route arrows vanish after undo/ })).toBeVisible()
    await settled(bugs, 0)
    await settled(board, 0)

    await setStatus(bugs, "In Review", "Done")
    await expect(persistenceNote(bugs)).toHaveText(NOTE.saved)
    const done = board.getByRole("region", { name: "Done", exact: true })
    await expect(done.getByRole("button", { name: /Route arrows vanish after undo/ })).toBeVisible()
    await expect(review.getByText("Route arrows vanish after undo")).toHaveCount(0)
    await expect(persistenceNote(board)).toHaveText(NOTE.saved)
    await settled(bugs, 1)
    await settled(board, 0)

    await resetDemoData(board, board.locator("main header").first())
    await expect(props(bugs).getByRole("button", { name: "In Review", exact: true })).toBeVisible()
    await expect(persistenceNote(bugs)).toHaveText(NOTE.unsaved)
    await settled(bugs, 1)
    await settled(board, 0)
  })

  test("empty state: every open bug fixed reads 'No open bugs' while the fixed ones stay listed", async ({ page }) => {
    await freshBugs(page)
    for (const [key, from] of [
      ["CHLK-419", "To Do"],
      ["CHLK-404", "In Progress"],
      ["CHLK-420", "In Review"],
    ] as const) {
      await page.goto(`/bugs?issue=${key}`)
      await setStatus(page, from, "Done")
    }
    await page.goto("/bugs")
    await expect(list(page).getByRole("status", { name: "Empty bug list" })).toHaveText("No open bugs")
    await expect(list(page).getByText("0 open · 4 fixed")).toBeVisible()
    await expect(list(page).getByRole("heading", { level: 2 })).toHaveText(["Done"])
    await expect(group(page, "Done").getByRole("link")).toHaveCount(4)

    await resetDemoData(page, pageHeader(page))
    await expect(list(page).getByRole("status", { name: "Empty bug list" })).toHaveCount(0)
    await expect(list(page).getByText("3 open · 1 fixed")).toBeVisible()
  })

  test("every text node reads at ≥ 4.5:1 in both themes, solid, no opacity", async ({ page }) => {
    await freshBugs(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(page.getByRole("heading", { level: 1, name: "Bugs" }), `${theme}/title`, expect)
      await expectReadable(crashCard(page), `${theme}/crash card`, expect)
      await expect(list(page).getByRole("note", { name: "Sample data" })).toBeVisible()
      const nodes = await expectReadable(list(page), `${theme}/bug list`, expect)
      for (const heading of ["To Do", "In Progress", "In Review", "Done"]) {
        expect(nodes.some((n) => n.text === heading), `${theme}: measured "${heading}"`).toBe(true)
      }
      expect(nodes.some((n) => n.text === "Sample data")).toBe(true)
      expect(
        nodes.some((n) => n.text.includes("example tickets from the Agent Workplace demo board"))
      ).toBe(true)
      expect(nodes.some((n) => n.text === "Bug · Crash")).toBe(true)
      expect(nodes.some((n) => n.text === "Bug · Coach-reported")).toBe(true)

      await bug(page, "CHLK-419").click()
      await expect(page).toHaveURL(/issue=CHLK-419/)
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

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await freshBugs(page)
    await expectProbeCatchesSabotage(crashCard(page), "crash card", expect)
    await expectProbeCatchesSabotage(bug(page, "CHLK-419"), "bug row", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(group(page, "Done"), "Done group (dark)", expect)
    await setTheme(page, "light")
  })
})
