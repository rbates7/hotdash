import { expect, test } from "@playwright/test"

test.describe("Home", () => {
  test("is the default screen and shows the day's pulse", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    // The demo clock (2026-08-27 14:00Z) is a Thursday morning in Chicago.
    await expect(page.getByText("Thursday pulse")).toBeVisible()

    // Sidebar marks Home as the current page.
    const rail = page.locator('[data-slot="sidebar"]').first()
    await expect(rail.getByRole("link", { name: "Home" })).toHaveAttribute("data-active")
    await expect(rail.getByRole("link", { name: "Metrics" })).not.toHaveAttribute("data-active")

    // #1 strip.
    const one = page.getByRole("region", { name: "Number one" })
    await expect(one.getByRole("heading", { level: 2, name: "Call Aledo before Friday" })).toBeVisible()
    await expect(one.getByRole("link", { name: "My Desk" })).toHaveAttribute("href", "/my-desk")

    // KPI strip.
    const kpis = page.getByRole("region", { name: "KPI strip" })
    await expect(kpis.getByRole("article")).toHaveCount(4)
    await expect(kpis.getByText("$26,190")).toBeVisible()
    await expect(kpis.getByText("3.8%")).toBeVisible()

    // Doors.
    const doors = page.getByRole("group", { name: "Doors" })
    await expect(doors.getByRole("region")).toHaveCount(3)
    await expect(doors.getByText("3 agents working")).toBeVisible()
    await expect(doors.getByText("2 waiting")).toBeVisible()
    await expect(doors.getByRole("list", { name: "Needs you" }).getByRole("link")).toHaveCount(3)
  })

  test("a Needs-you row opens its ticket in the Workplace Inbox", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: /Agent blocked/ }).click()
    await expect(page).toHaveURL(/\/agent-workplace\?tab=inbox&issue=CHLK-412$/)
    await expect(page.getByRole("heading", { level: 1, name: "Refund path for annual seats" })).toBeVisible()
  })

  test("the dev board door opens the board", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Open Agent Workplace" }).click()
    await expect(page).toHaveURL(/\/agent-workplace$/)
    await expect(page.getByRole("region", { name: "To Do" })).toBeVisible()
  })

  test("reflects the board: closing the linked tickets clears Needs you", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByText("2 waiting")).toBeVisible()

    // The three Needs-you rows and the column each ticket currently sits in.
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

    await page.goto("/home")
    const inbox = page.getByRole("region", { name: "Inbox" })
    await expect(inbox.getByText("Nothing needs you")).toBeVisible()
    await expect(inbox.getByText(/waiting/)).toHaveCount(0)

    // Reset the browser copy so other tests see the seed.
    await page.goto("/agent-workplace")
    await page.getByRole("button", { name: "Reset" }).click()
    await page.goto("/home")
    await expect(page.getByText("2 waiting")).toBeVisible()
  })

  test("renders in light and dark", async ({ page }) => {
    await page.goto("/home")
    await page.getByText("Light", { exact: true }).click()
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    await page.getByText("Dark", { exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
  })
})
