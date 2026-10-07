import { expect, test, type Page } from "@playwright/test"

import {
  addDays,
  formatDate,
  formatPeriod,
  now,
  periodEnding,
  todayIn,
} from "../src/lib/clock"
import { expectReadable } from "./support/contrast"
import { NOTE, resetDemoData } from "./support/persistence"

const STORAGE_KEY = "hotdash.metrics.v2"

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
  // Nothing edited in this browser yet, so nothing is saved — and it says so.
  await expect(page.getByTestId("persistence-note")).toHaveText(NOTE.unsaved)
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled()
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

  test("labels every hard-coded number as sample data, in both themes, at ≥ 4.5:1 on every text node", async ({ page }) => {
    await freshMetrics(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(sampleNote(page)).toBeVisible()
      await expect(sampleNote(page)).toContainText("Every number on this page is illustrative")
      for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
        await expect(card(page, name).getByTestId("sample-data-tag")).toBeVisible()
        await expect(card(page, name).getByTestId("sample-data-tag")).toHaveText("Sample data")
      }

      // Overview: header tag + notice + eight card tags + the picker's tag.
      await expectReadable(sampleNote(page), `${theme}/notice`, expect)
      await expectReadable(page.locator("main header").getByTestId("sample-data-tag"), `${theme}/header badge`, expect)
      for (const tag of await grid(page).getByTestId("sample-data-tag").all()) {
        await expectReadable(tag, `${theme}/card tag`, expect)
      }
      await page.getByRole("button", { name: "Add metric", exact: true }).click()
      const picker = page.getByRole("dialog", { name: "Add a metric" })
      await expectReadable(picker.getByTestId("sample-data-tag"), `${theme}/picker tag`, expect)
      await page.keyboard.press("Escape")

      // Expenses: the card's tag and the table strip (tag + explanatory line).
      await tab(page, "Expenses").click()
      await expect(page.getByTestId("sample-data-strip")).toBeVisible()
      const strip = await expectReadable(page.getByTestId("sample-data-strip"), `${theme}/table strip`, expect)
      expect(strip.some((n) => /illustrative/.test(n.text))).toBe(true)
      await expectReadable(card(page, "Expenses").getByTestId("sample-data-tag"), `${theme}/expenses card tag`, expect)
      await tab(page, "Overview").click()
    }
    await setTheme(page, "light")
  })

  test("sparklines are images, not stops: tabbing through the Overview never lands in a chart", async ({ page }) => {
    await freshMetrics(page)
    await expect(grid(page).getByRole("article")).toHaveCount(8)
    // Recharts must not add a role=application / focusable layer inside the img.
    // (Its z-index <g> layers carry tabindex="-1" regardless of accessibilityLayer;
    // -1 is not a tab stop and role=img makes the children presentational — the
    // keyboard walk below is the proof.)
    await expect(grid(page).locator('[role="img"] [role="application"]')).toHaveCount(0)
    await expect(grid(page).locator('[role="img"] [tabindex]:not([tabindex="-1"])')).toHaveCount(0)
    await expect(grid(page).locator('[role="img"] svg[tabindex], [role="img"] svg[role]')).toHaveCount(0)
    // Values are in the accessible name, so a screen reader gets the numbers.
    await expect(card(page, "MRR").getByRole("img", { name: /^MRR, six-month bar chart, .*\$26,190$/ })).toBeVisible()

    await page.getByRole("heading", { level: 1, name: "Metrics" }).focus()
    const seen: string[] = []
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab")
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return "body"
        const inImg = Boolean(el.closest('[role="img"]'))
        const inSvg = el.tagName.toLowerCase() === "svg" || Boolean(el.closest("svg"))
        return `${el.tagName.toLowerCase()}${inImg || inSvg ? " IN-CHART" : ""}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? ""}`
      })
      seen.push(info)
      if (info.startsWith("button:Add metric")) break
    }
    expect(seen.some((s) => s.startsWith("button:Add metric")), `reached Add metric: ${seen.join(" | ")}`).toBe(true)
    expect(seen.filter((s) => s.includes("IN-CHART"))).toEqual([])
  })

  test("switches views and each table shows its locked columns", async ({ page }) => {
    await page.goto("/metrics")

    await tab(page, "New Subscribers").click()
    await expect(page).toHaveURL(/tab=new$/)
    const fresh = table(page, "New subscribers")
    await expect(fresh.getByRole("columnheader")).toHaveText(["Name / Email", "Plan", "Signup Date"])
    await expect(fresh.getByRole("row")).toHaveCount(9)
    await expect(fresh.getByRole("row", { name: /Alisha Patel/ })).toContainText(formatDate(addDays(today(), -3)))
    // Every seed row sits inside the header's trailing-28-day period.
    const period = periodEnding(today())
    await expect(fresh.getByRole("row", { name: /Troy Nguyen/ })).toContainText(formatDate(period.start))

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
    // A visit that changes nothing writes nothing; the seed is never pinned.
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

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
    // Only now, after real edits, is there a save — under the v2 key — and the note says so.
    await expect(page.getByTestId("persistence-note")).toHaveText(NOTE.saved)
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(saved).toContain('"seededAt"')
    expect(await page.evaluate(() => localStorage.getItem("hotdash.metrics.v1"))).toBeNull()

    await page.reload()
    await expect(page.getByTestId("persistence-note")).toHaveText(NOTE.saved)
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
    // Default date is today on the page's clock (Central), bounded to the period.
    const day = today()
    await expect(dialog.getByLabel("Date")).toHaveValue(day)
    await expect(dialog.getByLabel("Date")).toHaveAttribute("max", day)
    await expect(dialog.getByLabel("Date")).toHaveAttribute("min", periodEnding(day).start)
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
    await expect(page.getByTestId("persistence-note")).toHaveText(NOTE.saved)
    await expect(expenses.getByRole("row", { name: /Vercel/ })).toBeVisible()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    // The Overview card is the same number.
    await tab(page, "Overview").click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")

    // Reset (behind its confirm) clears the key and puts the seed back.
    await resetDemoData(page)
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,240")
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(page.getByTestId("persistence-note")).toHaveText(NOTE.unsaved)
  })

  test("the board can be emptied and shows an empty state", async ({ page }) => {
    await freshMetrics(page)
    for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
      await card(page, name).getByRole("button", { name: `Remove ${name}` }).click()
    }
    await expect(grid(page)).toHaveCount(0)
    await expect(page.getByRole("status", { name: "Empty board" })).toContainText("No metrics on the board")
    await resetDemoData(page)
    await expect(grid(page).getByRole("article")).toHaveCount(8)
  })
})
