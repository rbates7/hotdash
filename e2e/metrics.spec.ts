import { expect, test, type Page } from "@playwright/test"

import {
  addDays,
  formatDate,
  formatPeriod,
  now,
  periodEnding,
  todayIn,
} from "../src/lib/metrics/clock"

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
  await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
}

type TextContrast = { where: string; text: string; ratio: number; fg: string; bg: string }

/**
 * WCAG contrast of every non-blank text node inside the sample-data
 * surfaces, against the first opaque background behind it (alpha-composited
 * up the ancestor chain, over the page background). Measured per text node,
 * not per container, so a muted child cannot hide behind a passing parent.
 */
async function sampleDataTextContrast(page: Page): Promise<TextContrast[]> {
  return page.evaluate(() => {
    // Tailwind v4 colours are oklch() and Chromium keeps that in computed
    // styles, so resolve every colour to sRGB through a canvas instead of
    // parsing: it understands any syntax the page does.
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!
    const parse = (css: string) => {
      if (!css || css === "transparent") return null
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "#000"
      ctx.fillStyle = css
      if (ctx.fillStyle === "#000000" && !/black|#000|rgb\(0, 0, 0\)|oklch\(0 /.test(css)) {
        // Canvas rejected the syntax and kept the previous fill.
        return null
      }
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a255] = ctx.getImageData(0, 0, 1, 1).data
      const a = a255 / 255
      if (a === 0) return null
      // Un-premultiply is implicit in getImageData; values are straight rgba.
      return { r, g, b, a }
    }
    const over = (top: { r: number; g: number; b: number; a: number }, under: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const backgroundBehind = (el: Element) => {
      // Collect translucent layers from the element up, then composite them
      // bottom-up over the page background.
      const layers: { r: number; g: number; b: number; a: number }[] = []
      let node: Element | null = el
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor)
        if (c && c.a > 0) {
          layers.unshift(c)
          if (c.a >= 1) break
        }
        node = node.parentElement
      }
      let out = { r: 255, g: 255, b: 255 }
      const pageBg = parse(getComputedStyle(document.body).backgroundColor)
      if (pageBg && pageBg.a > 0) out = over(pageBg, out)
      for (const l of layers) out = over(l, out)
      return out
    }
    const results: TextContrast[] = []
    const roots = document.querySelectorAll(
      "[data-testid=sample-data-tag], [data-testid=sample-data-notice], [data-testid=sample-data-strip]"
    )
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const text = t.textContent?.trim() ?? ""
        if (!text) continue
        const el = t.parentElement!
        const fg = parse(getComputedStyle(el).color)
        if (!fg) continue
        const bg = backgroundBehind(el)
        const fgOver = over(fg, bg)
        const l1 = lum(fgOver)
        const l2 = lum(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        results.push({
          where: root.getAttribute("data-testid")!,
          text: text.slice(0, 40),
          ratio: Math.round(ratio * 100) / 100,
          fg: getComputedStyle(el).color,
          bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        })
      }
    }
    return results
  })
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

      // Overview: notice + eight tags. Then the Expenses tab adds a card tag
      // and a table strip (tag + explanatory line).
      for (const view of ["Overview", "Expenses"] as const) {
        await tab(page, view).click()
        if (view === "Expenses") {
          await expect(page.getByTestId("sample-data-strip")).toBeVisible()
          await expect(card(page, "Expenses").getByTestId("sample-data-tag")).toBeVisible()
        } else {
          await expect(card(page, "MRR").getByTestId("sample-data-tag")).toBeVisible()
        }
        const measured = await sampleDataTextContrast(page)
        expect(measured.length, `${theme}/${view}: text nodes measured`).toBeGreaterThanOrEqual(view === "Overview" ? 10 : 5)
        const failing = measured.filter((m) => m.ratio < 4.5)
        expect(failing, `${theme}/${view}: every text node ≥ 4.5:1\n${JSON.stringify(measured, null, 2)}`).toEqual([])
        if (view === "Expenses") {
          expect(measured.some((m) => m.where === "sample-data-strip" && /illustrative/.test(m.text))).toBe(true)
        }
      }
      await tab(page, "Overview").click()
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
    // Only now, after real edits, is there a save — under the v2 key.
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(saved).toContain('"seededAt"')
    expect(await page.evaluate(() => localStorage.getItem("hotdash.metrics.v1"))).toBeNull()

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
