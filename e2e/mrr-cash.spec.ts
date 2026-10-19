import { expect, test, type Page } from "@playwright/test"

import { CONNECTING } from "../src/lib/stripe-summary"
import { MRR_CASH_CONNECTING } from "../src/lib/stripe-mrr-cash"
import { expectNonTextContrast, expectReadable } from "./support/contrast"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { LIVE_METRICS, liveMrrCash, liveSummary, mockMrrCash, mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"

/** The panel's connecting words (STRIPE_CONNECTING_PLACEHOLDER in mrr-cash-panel.tsx, same as the Metrics overview). */
const CONNECTING_TEXT = "Stripe is connecting (first sync in progress)"

/**
 * `GET /api/stripe/mrr-cash` and its panel on Metrics › Overview. The test
 * server has no Stripe key (see playwright.config.ts), so it is "not
 * connected", never "connecting" (which needs a key): no figures, never an
 * error body, and the panel says so without sample numbers.
 */
test("GET /api/stripe/mrr-cash: not connected without a key, exact shape", async ({ request }) => {
  const res = await request.get("/api/stripe/mrr-cash?tz=America/Chicago")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("application/json")
  expect(res.headers()["cache-control"]).toContain("no-store")
  expect(await res.json()).toEqual({ status: "not_connected", lastSyncedAt: null })
})

test("Metrics › Overview shows the MRR and cash panel as Stripe not connected", async ({ page }) => {
  await page.goto("/metrics")
  await waitForHydration(page)
  const panel = page.getByTestId("mrr-cash-panel")
  await expect(panel).toHaveAttribute("data-state", "not_connected")
  await expect(panel.getByRole("status")).toHaveText("Stripe not connected")
  await expect(panel).not.toContainText(/sample/i)
  await expect(panel).not.toContainText(/\$\d/)
})

/* ------------------------------------------- connecting, connected, stale */

/*
 * The live states mock /api/stripe/summary and /api/stripe/mrr-cash in the
 * browser (nothing reaches Stripe): connecting, connected and stale, at 390
 * and 1440 in both themes. Each checks the panel's words and figures, that
 * its text reads (expectReadable), that its bars and legend swatches clear
 * 3:1 against the card (WCAG 1.4.11), and no sideways scroll.
 */

const panelOf = (page: Page) => page.getByTestId("mrr-cash-panel")
const mrrCard = (page: Page) =>
  page.getByRole("main").getByRole("region", { name: "Metric cards" }).getByRole("article", { name: /^MRR\b/ })

/**
 * Home's Cash this week card, as it reads with the same mocks: the panel's
 * total must be this figure, so the two can never drift apart.
 */
async function homeCashThisWeek(page: Page) {
  await page.goto("/home")
  await waitForHydration(page)
  const card = page
    .getByRole("main")
    .getByRole("region", { name: "KPI strip" })
    .getByRole("article", { name: "Cash this week", exact: true })
  await expect(card).toHaveAttribute("data-source", "stripe")
  const value = (await card.getByTestId("kpi-value").textContent())?.trim() ?? ""
  expect(value).toMatch(/^\$[\d,]+$/)
  return value
}

/** The panel's cash total: Home's card figure, then last week's from the same summary, on one line. */
async function expectCashTotal(page: Page, panel: ReturnType<Page["locator"]>, homeValue: string) {
  const previous = `$${Math.round(LIVE_METRICS.cashThisWeek.previous).toLocaleString("en-US")}`
  await expect(panel.getByTestId("cash-week-value")).toHaveText(homeValue)
  await expect(panel.getByTestId("cash-week-previous")).toHaveText(previous)
  await expect(panel.getByTestId("cash-week-total")).toHaveText(`${homeValue} / ${previous}`)
  // One line, never split at "/" (390 too): no taller than one line box.
  const [height, line] = await panel.getByTestId("cash-week-total").evaluate((el) => {
    const r = el.getBoundingClientRect()
    return [r.height, parseFloat(getComputedStyle(el).lineHeight)]
  })
  expect(height, "cash total on one line").toBeLessThan(line * 1.5)
}

async function openMetrics(page: Page, theme: "light" | "dark") {
  await page.goto("/metrics")
  await waitForHydration(page)
  await setTheme(page, theme)
}

/** expectReadable on each match in turn (it measures one element). */
async function expectEachReadable(page: Page, locator: ReturnType<Page["locator"]>, label: string) {
  const count = await locator.count()
  expect(count, `${label}: elements`).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) await expectReadable(locator.nth(i), `${label} #${i}`, expect)
}

const PANEL_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const

for (const vp of PANEL_VIEWPORTS) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`MRR and cash panel at ${vp.width} ${theme}`, () => {
      test.use({ viewport: vp })

      test("connecting: the placeholder says so, no figures, readable, no sideways scroll", async ({ page }) => {
        await mockStripe(page, CONNECTING)
        await mockMrrCash(page, MRR_CASH_CONNECTING)
        await openMetrics(page, theme)
        const panel = panelOf(page)
        await expect(panel).toHaveAttribute("data-state", "connecting")
        await expect(panel).toHaveAttribute("aria-busy", "true")
        await expect(panel.getByRole("status")).toHaveText(CONNECTING_TEXT)
        await expect(panel).not.toContainText(/\$\d/)
        await expect(panel).not.toContainText(/sample/i)
        await expectReadable(panel.getByTestId("mrr-cash-placeholder"), `${theme}/${vp.width} connecting`, expect)
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      })

      test("connected: figures agree with the cards, legend, readable, bars 3:1, no sideways scroll", async ({ page }) => {
        await mockStripe(page, liveSummary())
        await mockMrrCash(page, liveMrrCash())
        const homeCash = await homeCashThisWeek(page)
        await openMetrics(page, theme)
        const panel = panelOf(page)
        await expect(panel).toHaveAttribute("data-state", "live")
        await expect(panel.getByTestId("mrr-cash-updated")).toHaveCount(0)

        // The last MRR bar is the MRR card's figure.
        const bars = panel.getByTestId("mrr-bar")
        await expect(bars).toHaveCount(12)
        const card = (await mrrCard(page).getByTestId("metric-value").textContent())?.trim() ?? ""
        expect(card).toBe("$61,235")
        await expect(bars.last()).toContainText(`so far: ${card}`)
        await expect(panel.getByTestId("mrr-chart-latest")).toHaveText(card)
        await expect(panel.getByTestId("mrr-chart-caption")).toHaveText(
          "MRR · 12 months · USD, past months at today's prices"
        )

        // This month's lighter bar says "so far" under it, not by shade alone.
        await expect(panel.getByTestId("mrr-axis-last")).toHaveText(/ so far$/)

        // Cash this week: Home's card figure, seven days, the future still ahead.
        await expectCashTotal(page, panel, homeCash)
        const days = panel.getByTestId("cash-day")
        await expect(days).toHaveCount(7)
        await expect(days.nth(0)).toContainText("$2,000, last week $1,500")
        for (let i = 2; i < 7; i++) await expect(days.nth(i)).toContainText("still ahead")

        // The legend names both series, so colour is never the only cue.
        const legend = panel.getByTestId("cash-legend")
        await expect(legend).toBeVisible()
        await expect(legend).toContainText("This week")
        await expect(legend).toContainText("Last week")

        await expectEachReadable(page, panel.locator("figcaption"), `${theme}/${vp.width} captions`)
        await expectReadable(legend, `${theme}/${vp.width} legend`, expect)

        // Non-text contrast: every bar and swatch at least 3:1 against the card.
        const lastWeek = await expectNonTextContrast(
          panel.locator("[data-testid=cash-bar-last-week], [data-testid=cash-legend-last-week]"),
          `${theme}/${vp.width} last-week bars`,
          expect
        )
        expect(lastWeek.length).toBe(8)
        await expectNonTextContrast(
          panel.locator("[data-testid=cash-bar-this-week], [data-testid=cash-legend-this-week]"),
          `${theme}/${vp.width} this-week bars`,
          expect
        )
        await expectNonTextContrast(bars, `${theme}/${vp.width} MRR bars`, expect)

        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
        const box = await panel.boundingBox()
        expect(box!.x + box!.width, "panel inside the viewport").toBeLessThanOrEqual(vp.width)
      })

      test("stale: last figures with Last updated, readable, no sideways scroll", async ({ page }) => {
        await mockStripe(page, liveSummary("stale"))
        await mockMrrCash(page, liveMrrCash("stale"))
        const homeCash = await homeCashThisWeek(page)
        await openMetrics(page, theme)
        const panel = panelOf(page)
        await expect(panel).toHaveAttribute("data-state", "live")
        const updated = panel.getByTestId("mrr-cash-updated")
        await expect(updated).toHaveText(/^Last updated /)
        await expectCashTotal(page, panel, homeCash)
        await expect(panel.getByTestId("mrr-bar")).toHaveCount(12)
        await expectReadable(updated, `${theme}/${vp.width} stale updated`, expect)
        await expectEachReadable(page, panel.locator("figcaption"), `${theme}/${vp.width} stale captions`)
        await expectNonTextContrast(
          panel.locator("[data-testid=cash-bar-last-week], [data-testid=cash-legend-last-week]"),
          `${theme}/${vp.width} stale last-week bars`,
          expect
        )
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      })
    })
  }
}
