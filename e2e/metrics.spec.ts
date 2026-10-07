import { expect, test, type Page } from "@playwright/test"

import {
  addDays,
  formatDate,
  formatPeriod,
  now,
  periodEnding,
  todayIn,
} from "../src/lib/metrics/clock"

const STORAGE_KEY = "hotdash.metrics.v1"

/**
 * Today on the founder's calendar (America/Chicago), from the same helper the
 * page uses. Read per test so a run that straddles Chicago midnight compares
 * against the day the page itself rendered with.
 */
const today = () => todayIn(now())

// Every role lookup below is scoped by name, directly or through a named
// ancestor, so a sibling panel mid-transition can never match.
const grid = (page: Page) => page.getByRole("region", { name: "Metric cards" })
const card = (page: Page, name: string) =>
  page.getByRole("article", { name, exact: true })
const tab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Metrics views" }).getByRole("tab", { name, exact: true })
const table = (page: Page, name: string) => page.getByRole("table", { name, exact: true })
const sampleNote = (page: Page) => page.getByRole("note", { name: "Sample data" })

async function freshMetrics(page: Page, path = "/metrics") {
  await page.goto(path)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

test.describe("Metrics", () => {
  test("is reachable from the sidebar and shows the Overview", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    // Real clock: the header is the trailing four weeks ending on today's
    // Central date — never a frozen period passed off as current.
    const day = today()
    const range = page.getByTestId("date-range")
    await expect(range).toBeVisible()
    await expect(range).toHaveText(formatPeriod(periodEnding(day)))
    await expect(range).toContainText(formatDate(day))

    for (const name of ["Overview", "New Subscribers", "Churned Subscribers", "Expenses"]) {
      await expect(tab(page, name)).toBeVisible()
    }
    await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true")

    await expect(grid(page).getByRole("article")).toHaveCount(8)
    const mrr = card(page, "MRR")
    await expect(mrr.getByTestId("metric-value")).toHaveText("$26,190")
    await expect(mrr.getByTestId("trend")).toHaveText("+4.2%")
    await expect(mrr.getByText("compared to last month")).toBeVisible()
    // Recharts draws once it has measured its box.
    await expect(mrr.getByRole("img", { name: /^MRR, six-month bar chart, / })).toBeVisible()
  })

  test("labels every hard-coded number as sample data, in both themes", async ({ page }) => {
    await freshMetrics(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(sampleNote(page)).toBeVisible()
      await expect(sampleNote(page)).toContainText("Every number on this page is illustrative")
      for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
        await expect(card(page, name).getByTestId("sample-data-tag")).toBeVisible()
        await expect(card(page, name).getByTestId("sample-data-tag")).toHaveText("Sample data")
      }
    }
    await setTheme(page, "light")

    await tab(page, "New Subscribers").click()
    await expect(table(page, "New subscribers")).toBeVisible()
    await expect(page.getByTestId("sample-data-tag")).toHaveText("Sample data")

    await tab(page, "Expenses").click()
    await expect(card(page, "Expenses").getByTestId("sample-data-tag")).toBeVisible()
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(2) // card + table strip
  })

  test("switches views and each table shows its locked columns", async ({ page }) => {
    await page.goto("/metrics")

    await tab(page, "New Subscribers").click()
    await expect(page).toHaveURL(/tab=new$/)
    const fresh = table(page, "New subscribers")
    await expect(fresh.getByRole("columnheader")).toHaveText(["Name / Email", "Plan", "Signup Date"])
    await expect(fresh.getByRole("row")).toHaveCount(9)
    await expect(fresh.getByRole("row", { name: /Alisha Patel/ })).toContainText(formatDate(addDays(today(), -3)))

    await tab(page, "Churned Subscribers").click()
    await expect(page).toHaveURL(/tab=churned$/)
    const churned = table(page, "Churned subscribers")
    await expect(churned.getByRole("columnheader")).toHaveText([
      "Name / Email",
      "Signup Date",
      "Churn Date",
      "Lifetime Value",
    ])
    await expect(churned.getByRole("row")).toHaveCount(6)
    await expect(churned.getByRole("row", { name: /Nina Cho/ })).toContainText("$398")

    await tab(page, "Expenses").click()
    await expect(page).toHaveURL(/tab=expenses$/)
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,240")
    await expect(table(page, "Expenses").getByRole("row")).toHaveCount(9)

    await page.goBack()
    await expect(page).toHaveURL(/tab=churned$/)
    await expect(tab(page, "Churned Subscribers")).toHaveAttribute("aria-selected", "true")
  })

  test("adds, removes and re-charts metric cards, and the layout survives reload", async ({ page }) => {
    await freshMetrics(page)

    await page.getByRole("button", { name: "Add metric", exact: true }).click()
    const picker = page.getByRole("dialog", { name: "Add a metric" })
    await expect(picker.getByRole("button")).toHaveText([
      /^CAC/,
      /^LTV/,
      /^ARPU/,
      /^NRR/,
      /^Runway/,
      /^NPS/,
      /^Valuation/,
    ])
    await picker.getByRole("button", { name: /^CAC/ }).click()
    await expect(picker).toBeHidden()
    await expect(card(page, "CAC").getByTestId("metric-value")).toHaveText("$142")
    await expect(grid(page).getByRole("article")).toHaveCount(9)

    await card(page, "ARR").getByRole("button", { name: "Remove ARR" }).click()
    await expect(card(page, "ARR")).toHaveCount(0)

    await card(page, "MRR").getByRole("button", { name: "MRR: line chart" }).click()
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")
    await expect(card(page, "MRR").getByRole("img", { name: /^MRR, six-month line chart, / })).toBeVisible()

    await page.reload()
    await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
    await expect(grid(page).getByRole("article")).toHaveCount(8)
    await expect(card(page, "CAC")).toBeVisible()
    await expect(card(page, "ARR")).toHaveCount(0)
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")

    // Removed defaults come back through the picker, after the extras.
    await page.getByRole("button", { name: "Add metric", exact: true }).click()
    await expect(picker.getByRole("button", { name: /^ARR/ })).toBeVisible()
    await expect(picker.getByRole("button").last()).toHaveText(/^ARR/)
    await page.keyboard.press("Escape")
  })

  test("adds an expense, the card follows, and it persists across reload", async ({ page }) => {
    await freshMetrics(page, "/metrics?tab=expenses")

    await page.getByRole("button", { name: "Add expense", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Add expense" })
    await dialog.getByRole("textbox", { name: "Category" }).fill("Vercel")
    await dialog.getByRole("spinbutton", { name: "Amount" }).fill("160")
    // Default date is today on the page's clock (Central), capped there.
    const day = today()
    await expect(dialog.getByLabel("Date")).toHaveValue(day)
    await expect(dialog.getByLabel("Date")).toHaveAttribute("max", day)
    await dialog.getByRole("switch", { name: "Recurring" }).click()
    await dialog.getByRole("button", { name: "Add expense", exact: true }).click()
    await expect(dialog).toBeHidden()

    const expenses = table(page, "Expenses")
    const row = expenses.getByRole("row", { name: /Vercel/ })
    await expect(row).toContainText("$160")
    await expect(row).toContainText(formatDate(day))
    await expect(row).toContainText("Yes")
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    await page.reload()
    await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
    await expect(expenses.getByRole("row", { name: /Vercel/ })).toBeVisible()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    // The Overview card is the same number.
    await tab(page, "Overview").click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    // Reset puts the seed back.
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,240")
  })

  test("the board can be emptied and shows an empty state", async ({ page }) => {
    await freshMetrics(page)
    for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
      await card(page, name).getByRole("button", { name: `Remove ${name}` }).click()
    }
    await expect(grid(page)).toHaveCount(0)
    await expect(page.getByRole("status", { name: "Empty board" })).toContainText("No metrics on the board")
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(grid(page).getByRole("article")).toHaveCount(8)
  })
})
