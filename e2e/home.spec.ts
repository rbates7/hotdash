import { expect, test } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { liveInbox, mockInbox } from "./support/inbox"
import { setTheme } from "./support/theme"

/**
 * Home carries no sample data. The CI server has no Stripe key, so every
 * card without a real source must say Not connected (or show its honest
 * empty state) — never an invented figure, row or priority.
 */
test.describe("Home", () => {
  test("is the default screen and shows the day's pulse, with no mock content", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    const weekday = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "America/Chicago",
    })
    await expect(page.getByText(`${weekday} pulse`)).toBeVisible()

    const rail = page.getByRole("navigation", { name: "Founder dashboard" })
    await expect(rail.getByRole("link", { name: "Home" })).toHaveAttribute("data-active")

    const main = page.locator("main")
    await expect(main.getByText(/Dummy \/ design mock/i)).toHaveCount(0)
    await expect(main.getByText(/Aledo/)).toHaveCount(0)
    await expect(main.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(main.getByTestId("persistence-note")).toHaveCount(0)

    // #1: the honest empty state.
    const one = page.getByRole("region", { name: "Number one" })
    await expect(one.getByRole("heading", { level: 2, name: "No #1 yet" })).toBeVisible()
    await expect(one.getByText("Your #1 will come from My Desk once it\u2019s connected.")).toBeVisible()
    await expect(one.getByText(/Pick one on My Desk/)).toHaveCount(0)
    await expect(one.getByRole("link", { name: "My Desk" })).toHaveAttribute("href", "/my-desk")

    // Truth strip: both cards Not connected, no figures.
    const kpis = page.getByRole("region", { name: "KPI strip" })
    await expect(kpis.getByRole("article")).toHaveText([/Subscribers/, /Cash this week/])
    for (const card of await kpis.getByRole("article").all()) {
      await expect(card).toHaveAttribute("data-source", "not_connected")
      await expect(card.getByTestId("not-connected")).toBeVisible()
    }
    await expect(kpis.getByTestId("kpi-sample-label")).toHaveCount(0)

    // Doors: Metrics, Agent Workplace and Inbox all say Not connected (no
    // Stripe key, and no GitHub or Sentry token for /api/inbox).
    const doors = page.getByRole("group", { name: "Doors" })
    await expect(doors.getByRole("region")).toHaveCount(3)
    for (const name of ["Metrics", "Agent Workplace", "Inbox"]) {
      await expect(doors.getByRole("region", { name }).getByTestId("not-connected")).toBeVisible()
    }
    await expect(doors.getByText(/agents? working/)).toHaveCount(0)
    await expect(doors.getByText(/waiting/)).toHaveCount(0)
    await expect(doors.getByRole("list", { name: "Needs you" })).toHaveCount(0)
    await expect(doors.getByRole("img")).toHaveCount(0)
  })

  test("with a live Inbox (mocked), Needs you lists only what needs Rashad and opens the Workplace Inbox", async ({ page }) => {
    await mockInbox(page, liveInbox(Date.now()))
    await page.goto("/home")
    const inbox = page.getByRole("region", { name: "Inbox" })
    await expect(inbox.getByText("3 waiting")).toBeVisible()
    await expect(inbox.getByRole("list", { name: "Needs you" }).getByRole("link")).toHaveCount(3)
    await expect(inbox.getByText(/needs a fix|Ongoing/)).toHaveCount(0)
    await page.getByRole("link", { name: /#912 Roster import/ }).click()
    await expect(page).toHaveURL(/\/agent-workplace\?tab=inbox$/)
    const panel = page.getByRole("tabpanel", { name: "Inbox" })
    await expect(panel.getByRole("list", { name: "Inbox" }).getByRole("listitem")).toHaveCount(5)
    await expect(panel.getByRole("link", { name: /#912 Roster import/ })).toHaveAttribute(
      "href",
      "https://github.com/rbates7/hotdash/pull/912"
    )
  })

  test("the Agent Workplace door still opens the board", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Open Agent Workplace" }).click()
    await expect(page).toHaveURL(/\/agent-workplace$/)
  })

  test("Not connected states are readable in light and dark", async ({ page }) => {
    await page.goto("/home")
    const badges = page.locator("main").getByTestId("not-connected").filter({ visible: true })
    await expect(badges.first()).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      for (const badge of await badges.all()) {
        await expectReadable(badge, `${theme} not-connected badge`, expect)
      }
      for (const hint of await page.getByTestId("door-not-connected").all()) {
        await expectReadable(hint, `${theme} door hint`, expect)
      }
    }
  })

  for (const width of [390, 820, 1180]) {
    test(`the subscriber Not connected link is a 44px target at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/home")
      const link = page
        .getByTestId("subscriber-ticker")
        .filter({ visible: true })
        .first()
        .getByRole("link", { name: /Subscribers: not connected/ })
      await expect(link).toHaveAttribute("href", "/settings#connected-data")
      const box = await link.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    })
  }
})
