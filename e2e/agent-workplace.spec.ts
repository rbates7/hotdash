import { expect, test, type Page } from "@playwright/test"

import { founderBoard } from "../src/test/workplace"
import { NOTE, clearMyEntries, countWrites, expectWritesSettled, persistenceNote, storeFounderCopy } from "./support/persistence"

const KEY = "hotdash.agent-workplace.v2"

/**
 * The board ships empty, so a test that needs tickets stores the founder's
 * own (the old demo's content under CHLK-9xx keys and sprint-1x ids) before
 * the page loads.
 */
async function founderTickets(target: Pick<Page, "addInitScript">) {
  await storeFounderCopy(target, KEY, founderBoard(new Date()))
}

test.describe("Agent Workplace", () => {
  test("is reachable from the sidebar and shows the founder's board", async ({ page }) => {
    await founderTickets(page)
    await page.goto("/home")
    await page.getByRole("link", { name: "Agent Workplace", exact: true }).click()
    await expect(page).toHaveURL(/\/agent-workplace$/)
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()

    const tabs = page.getByRole("tab")
    await expect(tabs).toHaveText(["Issues", "Backlog", "Work board", "Agents", "Chat", "Autopilots", "Inbox"])

    for (const col of ["To Do", "In Progress", "In Review", "Done", "Blocked"]) {
      await expect(page.getByRole("region", { name: col })).toBeVisible()
    }
    await expect(page.getByText("3 agents working")).toBeVisible()
    await expect(page.getByText("Working", { exact: true })).toHaveCount(3)
  })

  test("a fresh browser has no tickets, no sprint and nothing to clear", async ({ page }) => {
    await page.goto("/agent-workplace")
    await page.evaluate((key) => localStorage.removeItem(key), KEY)
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(page.getByText("No sprint is running")).toBeVisible()
    await expect(page.getByText(/CHLK-4\d\d/)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Clear my entries", exact: true })).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByText(/Dummy \/ design mock/i)).toHaveCount(0)
  })

  test("filters by assignee kind", async ({ page }) => {
    await founderTickets(page)
    await page.goto("/agent-workplace")
    const todo = page.getByRole("region", { name: "To Do" })
    await expect(todo.getByText("Copy-link expires after 7 days")).toBeVisible()

    await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "New" }).click()
    await expect(todo.getByText("Snap-to-hash on new formations")).toBeVisible()
    await expect(todo.getByText("Copy-link expires after 7 days")).toHaveCount(0)

    await page.getByRole("group", { name: "Issue filters" }).getByRole("button", { name: "Agents" }).click()
    await expect(page.getByRole("region", { name: "In Progress" }).getByText("Undo stack for iPad canvas")).toBeVisible()
    await expect(page.getByRole("region", { name: "In Progress" }).getByText("Failed-card webhook from Stripe")).toHaveCount(0)
  })

  test("opens a ticket, edits priority + project, the edit survives reload, and Clear keeps the bug ticket", async ({ page }) => {
    await founderTickets(page)
    await page.goto("/agent-workplace")
    await page.getByRole("button", { name: /Undo stack for iPad canvas/ }).click()
    await expect(page).toHaveURL(/issue=CHLK-904/)
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()

    await page.getByRole("button", { name: "Priority: Urgent" }).click()
    await page.getByRole("button", { name: "Low", exact: true }).click()
    await expect(page.getByRole("button", { name: "Priority: Low" })).toBeVisible()
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Project: No project" }).click()
    await page.getByRole("button", { name: "Billing", exact: true }).click()
    await expect(page.getByRole("button", { name: "Project: Billing" })).toBeVisible()
    await page.keyboard.press("Escape")

    await expect(persistenceNote(page)).toHaveText(NOTE.saved)

    await page.reload()
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Priority: Low" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Project: Billing" })).toBeVisible()

    // Clear my entries deletes the board's tickets and sprints; this one is a
    // bug ticket, so it stays (it lives on Bugs), edits and all.
    await clearMyEntries(page)
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Priority: Low" })).toBeVisible()
    await page.goto("/agent-workplace?issue=CHLK-902")
    await expect(page.getByText("Issue CHLK-902 not found")).toBeVisible()
  })

  test("the other tabs: the roster from the founder's board, Chat a door, Autopilots and Inbox Not connected", async ({ page }) => {
    await founderTickets(page)
    await page.goto("/agent-workplace?tab=agents")
    await expect(page.getByRole("article", { name: "Grok-1" })).toContainText("Undo stack for iPad canvas")
    await expect(page.getByRole("article", { name: "Grok-3" })).toContainText("Working")

    // During the tab transition Base UI keeps the outgoing panel mounted, so
    // scope the panel by name and wait for the switch to settle before
    // asserting on its content.
    const chatTab = page.getByRole("tab", { name: "Chat" })
    await chatTab.click()
    await expect(chatTab).toHaveAttribute("aria-selected", "true")
    const chat = page.getByRole("tabpanel", { name: "Chat" })
    await expect(chat).toBeVisible()
    await expect(chat).toContainText(/door/i)
    await expect(chat).not.toContainText(/unified|thread/i)
    await expect(chat.getByRole("textbox")).toHaveCount(0)

    await page.getByRole("tab", { name: "Autopilots" }).click()
    await expect(page.getByTestId("autopilots-not-connected")).toContainText("Not connected")
    await expect(page.getByRole("row")).toHaveCount(0)

    // The Inbox is live (/api/inbox); with no GitHub or Sentry token in e2e
    // it says Not connected rather than showing sample rows.
    await page.getByRole("tab", { name: "Inbox" }).click()
    await expect(page.getByTestId("inbox-not-connected")).toContainText("Not connected")
    await expect(page.getByRole("tabpanel", { name: "Inbox" }).getByRole("listitem")).toHaveCount(0)
  })

  test("two tabs: an edit in A shows in B, Clear in A empties B's board but keeps the bug, and the writes settle", async ({ context }) => {
    await founderTickets(context)
    await countWrites(context, KEY)
    const settled = (p: Page, n: number) => expectWritesSettled(p, KEY, n)

    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto("/agent-workplace")
    await expect(persistenceNote(a)).toHaveText(NOTE.saved)
    await b.goto("/agent-workplace?issue=CHLK-904")
    await expect(persistenceNote(b)).toHaveText(NOTE.saved)
    await settled(a, 0)
    await settled(b, 0)

    // A edits a ticket; B (on the same ticket) sees it without writing anything back.
    await a.goto("/agent-workplace?issue=CHLK-904")
    const propsA = a.getByRole("complementary", { name: "Ticket properties" })
    await propsA.getByRole("button", { name: "Priority: Urgent" }).click()
    await a.getByRole("dialog").getByRole("button", { name: "Low", exact: true }).click()
    await a.keyboard.press("Escape")
    await expect(persistenceNote(a)).toHaveText(NOTE.saved)
    const propsB = b.getByRole("complementary", { name: "Ticket properties" })
    await expect(propsB.getByRole("button", { name: "Priority: Low" })).toBeVisible()
    await expect(persistenceNote(b)).toHaveText(NOTE.saved)
    await settled(a, 1)
    await settled(b, 0)

    // Clear in A deletes the board's tickets and sprints (one write); the bug
    // ticket stays, so B keeps showing it, edit and all, and writes nothing.
    await clearMyEntries(a, a.locator("main header").first())
    await expect(propsB.getByRole("button", { name: "Priority: Low" })).toBeVisible()
    await expect(b.getByRole("button", { name: "Clear my entries", exact: true })).toHaveAttribute("aria-disabled", "true")
    await settled(a, 2)
    await settled(b, 0)
    const saved = await a.evaluate((key) => localStorage.getItem(key), KEY)
    expect(saved).toContain('"CHLK-904"')
    expect(saved).not.toContain('"CHLK-902"')
  })
})
