import { expect, test, type Page } from "@playwright/test"

import {
  formatDate,
  formatPeriod,
  now,
  periodEnding,
  todayIn,
} from "../src/lib/clock"
import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { setTheme } from "./support/theme"
import { NOTE, countWrites, expectWritesSettled, persistenceNote, resetDemoData } from "./support/persistence"
import { DEFAULT_METRIC_IDS } from "../src/lib/metrics"

const STORAGE_KEY = "hotdash.metrics.v2"

/**
 * Today on the founder's calendar (America/Chicago), from the same helper the
 * page uses. Read per test so a run that straddles Chicago midnight compares
 * against the day the page itself rendered with.
 */
const today = () => todayIn(now())

// Every role lookup below is anchored to a *named* region or tab panel, so a
// sibling panel mid-transition (Base UI keeps the outgoing one briefly) can
// never match. The Expenses card exists on two panels — Overview's grid and
// the Expenses tab — hence two distinct helpers.
const panel = (page: Page, name: "Overview" | "New Subscribers" | "Churned Subscribers" | "Expenses") =>
  page.getByRole("tabpanel", { name, exact: true })
const grid = (page: Page) => panel(page, "Overview").getByRole("region", { name: "Metric cards" })
/** A card on the Overview board. */
const card = (page: Page, name: string) =>
  grid(page).getByRole("article", { name: new RegExp(`^${name}\\b`) })
/** The Expenses tab's own card. */
const expensesCard = (page: Page) =>
  panel(page, "Expenses").getByRole("article", { name: /^Expenses\b/ })
const tab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Metrics views" }).getByRole("tab", { name, exact: true })
const table = (page: Page, name: "New subscribers" | "Churned subscribers" | "Expenses") => {
  const owner = name === "New subscribers" ? "New Subscribers" : name === "Churned subscribers" ? "Churned Subscribers" : "Expenses"
  return panel(page, owner).getByRole("table", { name, exact: true })
}
/** The Metrics connection notice (Not connected / Connecting / Partly live). */
const connectionNote = (page: Page) => page.getByTestId("metrics-connection-notice")
const header = (page: Page) => page.locator("main header").first()
const headerTag = (page: Page) => header(page).getByTestId("sample-data-tag")
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })
const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard" })

/**
 * A saved board with one founder expense ($160 Vercel, dated today), so the
 * Expenses card has a figure and a chart. Nothing on the page is seeded.
 */
async function withFounderExpense(page: Page, path = "/metrics") {
  await page.goto(path)
  const day = today()
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    {
      key: STORAGE_KEY,
      state: {
        visible: [...DEFAULT_METRIC_IDS],
        charts: {},
        expenses: [{ id: "exp-9", category: "Vercel", amount: 160, date: day, recurring: true }],
        nextExpenseId: 10,
        seededAt: day,
      },
    }
  )
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
}

async function freshMetrics(page: Page, path = "/metrics") {
  await page.goto(path)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  // Nothing edited in this browser yet, so nothing is saved — and it says so.
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
}


test.describe("Metrics", () => {
  test("is reachable from the sidebar and shows the Overview", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "Metrics", exact: true }).click()
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

    await expect(grid(page).getByRole("article")).toHaveCount(9)
    // No key in e2e: Stripe's cards say Not connected, with no figure and no chart.
    const mrr = card(page, "MRR")
    await expect(mrr).toHaveAttribute("data-source", "not_connected")
    await expect(mrr.getByTestId("metric-value")).toHaveText("—")
    await expect(mrr.getByTestId("metric-not-connected")).toHaveText("No figures until Stripe is connected.")
    await expect(mrr.getByRole("img")).toHaveCount(0)
  })

  test("no invented figures: Not connected notice and cards, no Sample label, in both themes, at ≥ 4.5:1", async ({ page }) => {
    await freshMetrics(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(connectionNote(page)).toBeVisible()
      await expect(connectionNote(page)).toContainText("so no card has a figure")
      await expect(connectionNote(page)).not.toContainText("illustrative")
      await expect(headerTag(page)).toHaveCount(0)
      await expect(grid(page).getByTestId("sample-data-tag")).toHaveCount(0)
      for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Trials per day"]) {
        await expect(card(page, name)).toHaveAttribute("data-source", "not_connected")
        await expect(card(page, name).getByTestId("not-connected")).toHaveText("Not connected")
      }
      // Expenses counts only the founder's entries: none yet, so no figure.
      await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("—")
      await expect(card(page, "Expenses").getByTestId("metric-entries-note")).toBeVisible()

      await expectReadable(connectionNote(page), `${theme}/notice`, expect)
      await expectReadable(card(page, "MRR"), `${theme}/not-connected card`, expect)
      await expectReadable(card(page, "Expenses"), `${theme}/expenses card`, expect)

      // Expenses tab: no seed table and no Sample strip. With no founder
      // entries it is an empty state, readable in this theme.
      await tab(page, "Expenses").click()
      const empty = panel(page, "Expenses").getByRole("region", { name: "No expenses yet" })
      await expect(empty).toBeVisible()
      await expect(panel(page, "Expenses").getByTestId("sample-data-strip")).toHaveCount(0)
      await expect(panel(page, "Expenses").getByRole("table")).toHaveCount(0)
      await expect(empty.getByRole("button", { name: "Add expense", exact: true })).toBeVisible()
      await expectReadable(empty, `${theme}/expenses empty state`, expect)
      await expect(expensesCard(page).getByTestId("sample-data-tag")).toHaveCount(0)
      await tab(page, "Overview").click()
    }
    await setTheme(page, "light")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await freshMetrics(page)
    // One shared probe for every screen; if it stopped seeing unreadable
    // text, every contrast assertion above would pass vacuously.
    await expectProbeCatchesSabotage(connectionNote(page), "notice", expect)
    await expectProbeCatchesSabotage(card(page, "MRR").getByTestId("not-connected"), "card badge", expect)
    // The picker: its choices carry the Not connected word where a figure
    // would be (no fixture numbers), and the probe still sees it.
    await panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true }).click()
    const picker = page.getByRole("dialog", { name: "Add a metric" })
    const choice = picker.getByRole("button", { name: /^CAC/ })
    await expect(choice).toContainText("Not connected")
    await expectProbeCatchesSabotage(choice.getByText("Not connected", { exact: true }), "picker Not connected", expect)
    await page.keyboard.press("Escape")
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(connectionNote(page), "notice (dark)", expect)
    await setTheme(page, "light")
  })

  test("the disabled Reset does not react to hover and keeps its own size", async ({ page }) => {
    await freshMetrics(page)
    const reset = resetButton(page)
    await expect(reset).toHaveAttribute("aria-disabled", "true")
    const styles = () =>
      reset.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { background: cs.backgroundColor, color: cs.color, fontSize: cs.fontSize, paddingLeft: cs.paddingLeft, cursor: cs.cursor, opacity: cs.opacity }
      })
    const before = await styles()
    expect(before.fontSize).toBe("11px") // text-micro, not Nova's text-xs (12px)
    expect(before.paddingLeft).toBe("6px") // px-1.5, not Nova's px-2
    expect(before.cursor).toBe("not-allowed")
    expect(Number(before.opacity)).toBeCloseTo(0.5, 2)
    await reset.hover()
    await page.mouse.move(1, 1) // and back off again, to be sure the hover frame was painted first
    await reset.hover()
    const during = await styles()
    expect(during.background).toBe(before.background)
    expect(during.color).toBe(before.color)
    expect(during.fontSize).toBe("11px")
  })

  test("sparklines are images, not stops: tabbing through the Overview never lands in a chart", async ({ page }) => {
    // A founder expense gives the board a chart to walk past (Not connected cards draw none).
    await withFounderExpense(page)
    await expect(grid(page).getByRole("article")).toHaveCount(9)
    // Recharts must not add a role=application / focusable layer inside the img.
    // (Its z-index <g> layers carry tabindex="-1" regardless of accessibilityLayer;
    // -1 is not a tab stop and role=img makes the children presentational — the
    // keyboard walk below is the proof.)
    await expect(grid(page).locator('[role="img"] [role="application"]')).toHaveCount(0)
    await expect(grid(page).locator('[role="img"] [tabindex]:not([tabindex="-1"])')).toHaveCount(0)
    await expect(grid(page).locator('[role="img"] svg[tabindex], [role="img"] svg[role]')).toHaveCount(0)
    // Values are in the accessible name, so a screen reader gets the numbers.
    await expect(card(page, "Expenses").getByRole("img", { name: /^Expenses, bar chart of six 28-day windows, .*\$160$/ })).toBeVisible()
    await expect(card(page, "MRR").getByRole("img")).toHaveCount(0)

    await page.getByRole("heading", { level: 1, name: "Metrics" }).focus()
    // Start from the Overview panel's first stop so the walk is deterministic.
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

  test("switches views: subscriber lists say Not connected, Expenses is empty, and Back works", async ({ page }) => {
    await page.goto("/metrics")

    // The tab can be clicked before hydration attaches its handler; retry the
    // click until the URL changes rather than racing hydration.
    await expect(async () => {
      await tab(page, "New Subscribers").click()
      await expect(page).toHaveURL(/tab=new$/, { timeout: 1000 })
    }).toPass({ timeout: 10_000 })
    // No per-customer source yet: the lists say Not connected, with no rows.
    const fresh = panel(page, "New Subscribers").getByRole("region", { name: "New subscribers: not connected" })
    await expect(fresh).toBeVisible()
    await expect(panel(page, "New Subscribers").getByRole("table")).toHaveCount(0)

    await tab(page, "Churned Subscribers").click()
    await expect(page).toHaveURL(/tab=churned$/)
    await expect(panel(page, "Churned Subscribers").getByRole("region", { name: "Churned subscribers: not connected" })).toBeVisible()
    await expect(panel(page, "Churned Subscribers").getByRole("table")).toHaveCount(0)

    await tab(page, "Expenses").click()
    await expect(page).toHaveURL(/tab=expenses$/)
    // No seed rows: with no founder entries the tab is an empty state and the card has no figure.
    await expect(expensesCard(page).getByTestId("metric-value")).toHaveText("—")
    await expect(expensesCard(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(panel(page, "Expenses").getByRole("region", { name: "No expenses yet" })).toBeVisible()
    await expect(panel(page, "Expenses").getByRole("table")).toHaveCount(0)

    await page.goBack()
    await expect(page).toHaveURL(/tab=churned$/)
    await expect(tab(page, "Churned Subscribers")).toHaveAttribute("aria-selected", "true")
  })

  test("adds, removes and re-charts metric cards, and the layout survives reload", async ({ page }) => {
    await freshMetrics(page)
    // A visit that changes nothing writes nothing; the seed is never pinned.
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    await panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true }).click()
    const picker = page.getByRole("dialog", { name: "Add a metric" })
    await expect(picker.getByRole("button")).toHaveText([
      /^Active Users/,
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
    // No fixture figure: CAC has no source yet.
    await expect(card(page, "CAC").getByTestId("metric-value")).toHaveText("—")
    await expect(grid(page).getByRole("article")).toHaveCount(10)

    await card(page, "ARR").getByRole("button", { name: "Remove ARR" }).click()
    await expect(card(page, "ARR")).toHaveCount(0)

    await card(page, "MRR").getByRole("button", { name: "MRR: line chart" }).click()
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")
    // Not connected cards draw no chart; the choice is still remembered.
    await expect(card(page, "MRR").getByRole("img")).toHaveCount(0)
    // Only now, after real edits, is there a save — under the v2 key — and the note says so.
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(saved).toContain('"seededAt"')
    expect(await page.evaluate(() => localStorage.getItem("hotdash.metrics.v1"))).toBeNull()

    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(grid(page).getByRole("article")).toHaveCount(9)
    await expect(card(page, "CAC")).toBeVisible()
    await expect(card(page, "ARR")).toHaveCount(0)
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")

    // Removed defaults come back through the picker, after the extras.
    await panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true }).click()
    await expect(picker.getByRole("button", { name: /^ARR/ })).toBeVisible()
    await expect(picker.getByRole("button").last()).toHaveText(/^ARR/)
    await page.keyboard.press("Escape")
  })

  test("adds an expense, the card follows, and it persists across reload", async ({ page }) => {
    await freshMetrics(page, "/metrics?tab=expenses")

    // No founder entries yet: the empty state carries the one Add expense.
    const empty = panel(page, "Expenses").getByRole("region", { name: "No expenses yet" })
    await expect(empty).toBeVisible()
    await empty.getByRole("button", { name: "Add expense", exact: true }).click()
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
    await expect(expensesCard(page).getByTestId("metric-value")).toHaveText("$160")
    await expect(empty).toHaveCount(0)
    await expect(expenses.getByRole("row")).toHaveCount(2)

    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(expenses.getByRole("row", { name: /Vercel/ })).toBeVisible()
    await expect(expensesCard(page).getByTestId("metric-value")).toHaveText("$160")

    // The Overview card is the same number.
    await tab(page, "Overview").click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$160")

    // Reset (behind its confirm) clears the key: an empty board again, no entries, no figure.
    await resetDemoData(page)
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("—")
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  })

  test("two tabs: an edit in one reaches the other, a Reset in one re-seeds the other, and the writes settle", async ({ context }) => {
    // Count real writes to our key from inside each tab, before any page
    // script runs. Same-origin pages in one context share localStorage and
    // receive each other's `storage` events, exactly like two browser tabs.
    await countWrites(context, STORAGE_KEY)

    const a = await context.newPage()
    const b = await context.newPage()
    await freshMetrics(a)
    await b.goto("/metrics")
    await expect(persistenceNote(b)).toHaveText(NOTE.unsaved)
    // Writes are counted after the other tab has visibly taken the change
    // (web-first), then must stay flat over a quiet window: a loop would
    // move the count and the poll would never settle.
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)
    await settled(a, 0)
    await settled(b, 0)

    // A edits: one write in A; B hears it and takes the copy without writing.
    await card(a, "ARR").getByRole("button", { name: "Remove ARR" }).click()
    await expect(card(b, "ARR")).toHaveCount(0)
    await expect(persistenceNote(b)).toHaveText(NOTE.saved)
    await settled(a, 1)
    await settled(b, 0)

    // B edits: one write in B; A follows the same way, still at one.
    await card(b, "MRR").getByRole("button", { name: "MRR: line chart" }).click()
    await expect(card(a, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")
    await settled(a, 1)
    await settled(b, 1)

    // A Reset in B clears the key; A goes back to a fresh seed too.
    await resetDemoData(b)
    await expect(grid(a).getByRole("article")).toHaveCount(9)
    await expect(persistenceNote(a)).toHaveText(NOTE.unsaved)
    await settled(a, 1)
    await settled(b, 1)
    expect(await a.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test("the board can be emptied and shows an empty state", async ({ page }) => {
    await freshMetrics(page)
    for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Trials per day", "Expenses"]) {
      await card(page, name).getByRole("button", { name: `Remove ${name}` }).click()
    }
    await expect(grid(page)).toHaveCount(0)
    await expect(panel(page, "Overview").getByRole("status", { name: "Empty board" })).toContainText("No metrics on the board")
    await resetDemoData(page)
    await expect(grid(page).getByRole("article")).toHaveCount(9)
  })
})
