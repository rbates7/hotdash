import { expect, test, type Page } from "@playwright/test"

const STORAGE_KEY = "hotdash.metrics.v1"

async function freshMetrics(page: Page, path = "/metrics") {
  await page.goto(path)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
}

const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true })

test.describe("Metrics", () => {
  test("is reachable from the sidebar and shows the Overview", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Metrics" }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    await expect(page.getByText("Dummy numbers")).toBeVisible()
    await expect(page.getByText("25 Jul – 21 Aug 2026")).toBeVisible()

    await expect(page.getByRole("tab")).toHaveText([
      "Overview",
      "New Subscribers",
      "Churned Subscribers",
      "Expenses",
    ])
    await expect(page.getByRole("article")).toHaveCount(8)
    const mrr = card(page, "MRR")
    await expect(mrr.getByTestId("metric-value")).toHaveText("$26,190")
    await expect(mrr.getByTestId("trend")).toHaveText("+4.2%")
    await expect(mrr.getByText("compared to last month")).toBeVisible()
    // Recharts draws once it has measured its box.
    await expect(mrr.locator("svg.recharts-surface")).toBeVisible()
  })

  test("switches views and each table shows its locked columns", async ({ page }) => {
    await page.goto("/metrics")

    await page.getByRole("tab", { name: "New Subscribers" }).click()
    await expect(page).toHaveURL(/tab=new$/)
    const fresh = page.getByRole("table", { name: "New subscribers" })
    await expect(fresh.getByRole("columnheader")).toHaveText(["Name / Email", "Plan", "Signup Date"])
    await expect(fresh.getByRole("row")).toHaveCount(9)
    await expect(fresh.getByText("Alisha Patel")).toBeVisible()

    await page.getByRole("tab", { name: "Churned Subscribers" }).click()
    await expect(page).toHaveURL(/tab=churned$/)
    const churned = page.getByRole("table", { name: "Churned subscribers" })
    await expect(churned.getByRole("columnheader")).toHaveText([
      "Name / Email",
      "Signup Date",
      "Churn Date",
      "Lifetime Value",
    ])
    await expect(churned.getByRole("row")).toHaveCount(6)
    await expect(churned.getByText("$398")).toHaveCount(2)

    await page.getByRole("tab", { name: "Expenses" }).click()
    await expect(page).toHaveURL(/tab=expenses$/)
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,240")
    const expenses = page.getByRole("table", { name: "Expenses" })
    await expect(expenses.getByRole("row")).toHaveCount(9)

    await page.goBack()
    await expect(page).toHaveURL(/tab=churned$/)
    await expect(page.getByRole("tab", { name: "Churned Subscribers" })).toHaveAttribute("aria-selected", "true")
  })

  test("adds, removes and re-charts metric cards, and the layout survives reload", async ({ page }) => {
    await freshMetrics(page)

    await page.getByRole("button", { name: "Add metric" }).click()
    const picker = page.getByRole("dialog", { name: "Add a metric" })
    await expect(picker.getByRole("button")).toHaveCount(7)
    await picker.getByRole("button", { name: /^CAC/ }).click()
    await expect(picker).toBeHidden()
    await expect(card(page, "CAC").getByTestId("metric-value")).toHaveText("$142")
    await expect(page.getByRole("article")).toHaveCount(9)

    await card(page, "ARR").getByRole("button", { name: "Remove ARR" }).click()
    await expect(card(page, "ARR")).toHaveCount(0)

    await card(page, "MRR").getByRole("button", { name: "MRR: line chart" }).click()
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")
    await expect(card(page, "MRR").locator("path.recharts-curve")).toBeVisible()

    await page.reload()
    await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
    await expect(page.getByRole("article")).toHaveCount(8)
    await expect(card(page, "CAC")).toBeVisible()
    await expect(card(page, "ARR")).toHaveCount(0)
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")

    // Removed defaults come back through the picker, after the extras.
    await page.getByRole("button", { name: "Add metric" }).click()
    await expect(picker.getByRole("button").last()).toHaveText(/^ARR/)
    await page.keyboard.press("Escape")
  })

  test("adds an expense, the card follows, and it persists across reload", async ({ page }) => {
    await freshMetrics(page, "/metrics?tab=expenses")

    await page.getByRole("button", { name: "Add expense" }).click()
    const dialog = page.getByRole("dialog", { name: "Add expense" })
    await dialog.getByRole("textbox", { name: "Category" }).fill("Vercel")
    await dialog.getByRole("spinbutton", { name: "Amount" }).fill("160")
    await dialog.getByRole("switch", { name: "Recurring" }).click()
    await dialog.getByRole("button", { name: "Add expense" }).click()
    await expect(dialog).toBeHidden()

    const table = page.getByRole("table", { name: "Expenses" })
    const row = table.getByRole("row").filter({ hasText: "Vercel" })
    await expect(row).toContainText("$160")
    await expect(row).toContainText("21 Aug 2026")
    await expect(row).toContainText("Yes")
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    await page.reload()
    await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
    await expect(table.getByRole("row").filter({ hasText: "Vercel" })).toBeVisible()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    // The Overview card is the same number.
    await page.getByRole("tab", { name: "Overview" }).click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    // Reset puts the seed back.
    await page.getByRole("button", { name: "Reset" }).click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,240")
  })

  test("the board can be emptied and shows an empty state", async ({ page }) => {
    await freshMetrics(page)
    for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
      await card(page, name).getByRole("button", { name: `Remove ${name}` }).click()
    }
    await expect(page.getByRole("article")).toHaveCount(0)
    await expect(page.getByRole("status")).toContainText("No metrics on the board")
    await page.getByRole("button", { name: "Reset" }).click()
    await expect(page.getByRole("article")).toHaveCount(8)
  })
})
