import { expect, test } from "@playwright/test"

import { NOTE, countWrites, persistenceNote, resetDemoData, writesTo } from "./support/persistence"

test.describe("Agent Workplace", () => {
  test("is reachable from the sidebar and shows the board", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Agent Workplace", exact: true }).click()
    await expect(page).toHaveURL(/\/agent-workplace$/)
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()

    const tabs = page.getByRole("tab")
    await expect(tabs).toHaveText(["Issues", "Backlog", "Agents", "Chat", "Autopilots", "Inbox"])

    for (const col of ["To Do", "In Progress", "In Review", "Done", "Blocked"]) {
      await expect(page.getByRole("region", { name: col })).toBeVisible()
    }
    await expect(page.getByText("3 agents working")).toBeVisible()
    await expect(page.getByText("Working", { exact: true })).toHaveCount(3)
  })

  test("filters by assignee kind", async ({ page }) => {
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

  test("opens a ticket, edits priority + project, and the edit survives reload", async ({ page }) => {
    await page.goto("/agent-workplace")
    await page.getByRole("button", { name: /Undo stack for iPad canvas/ }).click()
    await expect(page).toHaveURL(/issue=CHLK-404/)
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

    // Reset puts the seed back.
    await resetDemoData(page)
    await expect(page.getByRole("button", { name: "Priority: Urgent" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Project: No project" })).toBeVisible()
  })

  test("the other tabs render their mock content", async ({ page }) => {
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
    await expect(page.getByRole("row")).toHaveCount(4)

    await page.getByRole("tab", { name: "Inbox" }).click()
    await page.getByRole("button", { name: /Agent blocked/ }).click()
    await expect(page).toHaveURL(/issue=CHLK-412/)
    await expect(page.getByText("Waiting on Stripe dashboard access.")).toBeVisible()
  })

  test("two tabs: an edit in A shows in B, Reset in A re-seeds B, and the writes settle", async ({ context }) => {
    const KEY = "hotdash.agent-workplace.v2"
    await countWrites(context, KEY)
    const settled = async (p: import("@playwright/test").Page, n: number) =>
      expect.poll(() => writesTo(p, KEY), { intervals: [100, 200, 400], timeout: 2_000 }).toBe(n)

    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto("/agent-workplace")
    await a.evaluate((key) => localStorage.removeItem(key), KEY)
    await a.reload()
    await expect(persistenceNote(a)).toHaveText(NOTE.unsaved)
    await b.goto("/agent-workplace?issue=CHLK-404")
    await expect(persistenceNote(b)).toHaveText(NOTE.unsaved)
    await settled(a, 0)
    await settled(b, 0)

    // A edits a ticket; B (on the same ticket) sees it without writing anything back.
    await a.goto("/agent-workplace?issue=CHLK-404")
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

    // Reset in A clears the key; B goes back to the seed.
    await resetDemoData(a, a.locator("main header").first())
    await expect(propsB.getByRole("button", { name: "Priority: Urgent" })).toBeVisible()
    await expect(persistenceNote(b)).toHaveText(NOTE.unsaved)
    await settled(a, 1)
    await settled(b, 0)
    expect(await a.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  })
})
