import { expect, test, type Page } from "@playwright/test"

import { METRIC_IDS } from "../src/lib/metrics"
import {
  CHURNED_ROWS,
  LIVE_METRICS_FULL,
  NEW_ROWS,
  subscriberList,
} from "../src/test/stripe-fixture"
import { expectReadable } from "./support/contrast"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { liveSummary, mockStripe, mockSubscriberLists } from "./support/stripe"
import { expectTapTarget } from "./support/tap-target"
import { setTheme } from "./support/theme"

/**
 * Metrics wired to Hill's provisional Stripe fields, at 390 (phone), both
 * themes. Everything is mocked in the browser: `/api/stripe/summary` with
 * every optional field (`LIVE_METRICS_FULL`) and
 * `/api/stripe/subscribers?list=…` with fictional @example.com coaches.
 * Nothing reaches Stripe. Defaults pending Simmons: Metrics-only active
 * paying headline, Past due in amber (not a link), Trials per day beside
 * Trial Conversions, Stale = "Last updated" plus an amber badge.
 */

test.use({ viewport: { width: 390, height: 844 } })

/** `metrics-store`'s key (a client module, so not imported here). */
const STORAGE_KEY = "hotdash.metrics.v2"

const main = (page: Page) => page.getByRole("main")
const grid = (page: Page) => main(page).getByRole("region", { name: "Metric cards" })
const metricCard = (page: Page, name: string) => grid(page).getByRole("article", { name: new RegExp(`^${name}\\b`) })
const tabPanel = (page: Page, name: string) => main(page).getByRole("tabpanel", { name, exact: true })

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/** A saved board with the extra money cards on it (ARPU, LTV, NRR are not defaults). */
async function boardWithExtras(page: Page) {
  await page.goto("/metrics")
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    {
      key: STORAGE_KEY,
      state: {
        visible: ["mrr", "arr", "revenue", "subscribers", "trials", "trials_per_day", "arpu", "ltv", "nrr"],
        charts: {},
        expenses: [],
        nextExpenseId: 9,
        seededAt: "2026-10-13",
        offered: [...METRIC_IDS],
      },
    }
  )
  await page.reload()
  await waitForHydration(page)
}

/** The colour `--warning-text` resolves to, beside `el`. */
async function isAmber(locator: ReturnType<Page["locator"]>) {
  const [value, amber] = await locator.evaluate((el) => {
    const probe = document.createElement("span")
    probe.style.color = "var(--warning-text)"
    el.parentElement!.appendChild(probe)
    const want = getComputedStyle(probe).color
    probe.remove()
    return [getComputedStyle(el).color, want]
  })
  return value === amber
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`Metrics real data at 390 ${theme}`, () => {
    test("Subscribers: active paying headline; Past due amber and not a link; App Store and Free on their own lines; Home keeps the total", async ({
      page,
    }) => {
      await mockStripe(page, liveSummary("connected", LIVE_METRICS_FULL))
      await open(page, "/metrics")
      await setTheme(page, theme)
      const card = metricCard(page, "Subscribers")
      await expect(card.getByTestId("metric-value")).toHaveText("1,110")
      await expect(card).toContainText("Active paying coaches")
      const rows = card.getByTestId("subscriber-breakdown").locator("[data-row]")
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(0).locator("dt")).toHaveText("Past due")
      await expect(rows.nth(0).locator("dd")).toHaveText("12 · $480 MRR")
      await expect(rows.nth(1)).toContainText("App Store")
      await expect(rows.nth(1).locator("dd")).toHaveText("53")
      await expect(rows.nth(2).locator("dd")).toHaveText("174")
      const pastDue = card.locator("[data-row='pastDue']")
      await expect(pastDue).toHaveAttribute("data-tone", "attention")
      expect(await isAmber(pastDue.locator("dd")), "Past due is amber").toBe(true)
      await expect(pastDue.locator("a, button")).toHaveCount(0)
      await expectReadable(card.getByTestId("subscriber-breakdown"), `${theme} Subscribers lines`, expect)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      await open(page, "/home")
      const home = main(page).getByRole("region", { name: "KPI strip" }).getByRole("article", { name: "Subscribers", exact: true })
      await expect(home).toContainText("1,337")
    })

    test("ARR, Revenue, ARPU, LTV, NRR and Trials per day carry Stripe's figures", async ({ page }) => {
      await mockStripe(page, liveSummary("connected", LIVE_METRICS_FULL))
      await boardWithExtras(page)
      await setTheme(page, theme)
      const expected: Record<string, string> = {
        ARR: "$734,815",
        Revenue: "$63,410",
        ARPU: "$55",
        LTV: "$1,874",
        NRR: "101.4%",
        "Trials per day": "40",
      }
      for (const [name, value] of Object.entries(expected)) {
        const c = metricCard(page, name)
        await expect(c).toHaveAttribute("data-source", "stripe")
        await expect(c.getByTestId("metric-value")).toHaveText(value)
        await expect(c.getByTestId("sample-data-tag")).toHaveCount(0)
        await expectReadable(c, `${theme} ${name}`, expect)
      }
      await expect(metricCard(page, "Revenue")).toContainText("1,204 paid invoices · gross, before refunds")
      // Trials per day sits right after Trial Conversions, with a 28-day chart.
      const names = await grid(page).getByRole("article").evaluateAll((els) => els.map((e) => e.getAttribute("data-metric")))
      expect(names.indexOf("trials_per_day")).toBe(names.indexOf("trials") + 1)
      const trials = metricCard(page, "Trials per day")
      await expect(trials).toContainText("Trials started in the last 28 days")
      await expect(trials.getByRole("img")).toHaveAttribute("aria-label", /bar chart of 28 days/)
      await expect(trials.getByTestId("trend")).toHaveText("+25.0%")
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("New Subscribers: rows newest first; a missing name shows the email, neither shows an em dash", async ({ page }) => {
      await mockStripe(page, liveSummary("connected", LIVE_METRICS_FULL))
      await mockSubscriberLists(page, { new: subscriberList("new", "connected", NEW_ROWS, 134) })
      await open(page, "/metrics?tab=new")
      await setTheme(page, theme)
      const panel = tabPanel(page, "New Subscribers")
      const list = panel.getByRole("region", { name: "New subscribers" })
      await expect(list.getByTestId("subscriber-list-count")).toContainText("Newest 3 of 134")
      await expect(list).toContainText("Avery Coach")
      await expect(list).toContainText("avery@example.com")
      await expect(list).toContainText("no-name@example.com")
      await expect(list).toContainText("\u2014")
      await expect(list.getByTestId("stale-badge")).toHaveCount(0)
      await expect(list).not.toContainText(/sample/i)
      await expectReadable(list, `${theme} new list`, expect)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("Churned Subscribers: stale shows Last updated and an amber Stale badge; reasons in words", async ({ page }) => {
      await mockStripe(page, liveSummary("stale", LIVE_METRICS_FULL))
      await mockSubscriberLists(page, { churned: subscriberList("churned", "stale", CHURNED_ROWS) })
      await open(page, "/metrics?tab=churned")
      await setTheme(page, theme)
      const list = tabPanel(page, "Churned Subscribers").getByRole("region", { name: "Churned subscribers" })
      await expect(list.getByTestId("subscriber-list-updated")).toHaveText("Last updated Tue, Oct 13 · 9:41 AM CDT")
      const badge = list.getByTestId("stale-badge")
      await expect(badge).toHaveText("Stale")
      expect(await isAmber(badge), "Stale badge is amber").toBe(true)
      await expect(list).toContainText("Canceled by customer")
      await expect(list).toContainText("Payment failed")
      await expectReadable(list, `${theme} churned list stale`, expect)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("empty lists say so in their own words", async ({ page }) => {
      await mockSubscriberLists(page, {
        new: subscriberList("new", "connected", [], 0),
        churned: subscriberList("churned", "connected", [], 0),
      })
      await open(page, "/metrics?tab=new")
      await setTheme(page, theme)
      await expect(tabPanel(page, "New Subscribers").getByTestId("subscriber-list-empty")).toHaveText("No new subscribers in this window")
      await open(page, "/metrics?tab=churned")
      await expect(tabPanel(page, "Churned Subscribers").getByTestId("subscriber-list-empty")).toHaveText(
        "No churned subscribers in this window"
      )
    })

    test("connecting shows a skeleton and Connecting…, never rows", async ({ page }) => {
      await mockSubscriberLists(page, {
        new: { status: "connecting", lastSyncedAt: null, list: "new", window: null, total: 0, rows: [] },
      })
      await open(page, "/metrics?tab=new")
      await setTheme(page, theme)
      const panel = tabPanel(page, "New Subscribers")
      await expect(panel.getByRole("status", { name: "New subscribers connecting" })).toBeVisible()
      await expect(panel.getByTestId("connecting")).toHaveText("Connecting…")
      await expect(panel.getByRole("table")).toHaveCount(0)
    })

    test("a 401 from the login gate says the session expired, with a 44px way to sign in again", async ({ page }) => {
      await mockSubscriberLists(page, { new: 401 })
      await open(page, "/metrics?tab=new")
      await setTheme(page, theme)
      const panel = tabPanel(page, "New Subscribers")
      const expired = panel.getByRole("region", { name: "New subscribers: session expired" })
      await expect(expired).toContainText("Your session expired.")
      await expect(panel).not.toContainText("Not connected")
      const link = expired.getByRole("link", { name: "Sign in again" })
      await expect(link).toHaveAttribute("href", /^\/unlock\?next=%2Fmetrics/)
      await expectTapTarget(link, `${theme} sign in again`)
      await expectReadable(expired, `${theme} session expired`, expect)
    })

    test("a server without the provisional fields: em dashes, never a made-up figure", async ({ page }) => {
      await mockStripe(page, liveSummary("connected"))
      await open(page, "/metrics")
      await setTheme(page, theme)
      for (const name of ["ARR", "Revenue", "Trials per day"]) {
        await expect(metricCard(page, name).getByTestId("metric-value")).toHaveText("\u2014")
        await expect(metricCard(page, name)).toContainText("Not in Stripe\u2019s figures yet")
      }
      await expect(metricCard(page, "Subscribers").locator("[data-row='pastDue'] dd")).toHaveText("\u2014")
    })
  })
}
