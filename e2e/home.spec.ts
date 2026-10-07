import { expect, test } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { NOTE, resetDemoData } from "./support/persistence"

test.describe("Home", () => {
  test("is the default screen and shows the day's pulse", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    // The lede is today's weekday where the founder is (Central), rendered on
    // the server from the real clock — not a frozen demo instant.
    const weekday = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "America/Chicago",
    })
    await expect(page.getByText(`${weekday} pulse`)).toBeVisible()

    // Sidebar marks Home as the current page.
    const rail = page.locator('[data-slot="sidebar"]').first()
    await expect(rail.getByRole("link", { name: "Home" })).toHaveAttribute("data-active")
    await expect(rail.getByRole("link", { name: "Metrics" })).not.toHaveAttribute("data-active")

    // #1 strip.
    const one = page.getByRole("region", { name: "Number one" })
    await expect(one.getByRole("heading", { level: 2, name: "Call Aledo before Friday" })).toBeVisible()
    await expect(one.getByRole("link", { name: "My Desk" })).toHaveAttribute("href", "/my-desk")

    // Truth strip: subscribers + cash this week — the Metrics page's own
    // numbers (shared KPI fixture) — each stamped as sample.
    const kpis = page.getByRole("region", { name: "KPI strip" })
    await expect(kpis.getByRole("heading", { name: "Truth strip" })).toBeVisible()
    await expect(kpis.getByRole("article")).toHaveText([/Subscribers/, /Cash this week/])
    await expect(kpis.getByText("186")).toBeVisible()
    await expect(kpis.getByText("$7,103")).toBeVisible()
    // Two card chips + the strip label; plus the Metrics door's chip.
    await expect(kpis.getByTestId("sample-data-tag")).toHaveCount(3)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(4)

    // Home reads the Workplace's browser-saved board and says so. Nothing
    // has been edited in this browser, so nothing is saved yet.
    await expect(page.getByTestId("persistence-note")).toHaveText(NOTE.unsaved)

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

    // The Workplace Inbox agrees: only the dismissed digest is left.
    await page.goto("/agent-workplace?tab=inbox")
    const panel = page.getByRole("tabpanel", { name: "Inbox" })
    await expect(panel.getByRole("listitem")).toHaveCount(1)
    await expect(panel.getByText("Daily standup summary")).toBeVisible()

    // Reset the browser copy so other tests see the seed.
    await page.goto("/agent-workplace")
    await resetDemoData(page)
    await page.goto("/home")
    await expect(page.getByText("2 waiting")).toBeVisible()
  })

  test("renders in light and dark, with readable sample-data labels on the strip and every card", async ({ page }) => {
    await page.goto("/home")
    const label = page.getByTestId("kpi-sample-label")
    // Two on the truth-strip cards, one strip label, one on the Metrics door.
    const chips = page.getByTestId("sample-data-tag")
    await expect(chips).toHaveCount(4)

    for (const theme of ["Light", "Dark"] as const) {
      await page.getByRole("button", { name: theme, exact: true }).click()
      await expect(page.locator("html")).toHaveClass(
        theme === "Dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
      )
      await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()

      await expect(label).toBeVisible()
      await expect(label).toContainText("Sample data")
      // Every text node — "Sample data" and the second clause alike.
      const labelNodes = await expectReadable(label, `${theme} strip label`, expect)
      expect(labelNodes.length).toBeGreaterThanOrEqual(2)

      for (const chip of await chips.all()) {
        await expect(chip).toBeVisible()
        await expect(chip).toContainText("Sample data")
        await expectReadable(chip, `${theme} chip`, expect)
      }
    }
  })
})
