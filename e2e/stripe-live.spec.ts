import { expect, test, type Page } from "@playwright/test"

import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/lib/settings"
import { expectReadable } from "./support/contrast"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { liveSummary, mockStripe } from "./support/stripe"
import { MIN_TAP, expectTapTarget } from "./support/tap-target"
import { setTheme } from "./support/theme"

/**
 * Live Stripe, three states, three screens. e2e never has a Stripe key:
 * "not connected" is the real server with none; "connected" and "stale"
 * mock /api/stripe/summary in the browser. Nothing here reaches Stripe.
 */

const main = (page: Page) => page.getByRole("main")
const strip = (page: Page) => main(page).getByRole("region", { name: "KPI strip" })
const kpi = (page: Page, name: string) => strip(page).getByRole("article", { name, exact: true })
const metricCard = (page: Page, name: string) =>
  main(page).getByRole("region", { name: "Metric cards" }).getByRole("article", { name: new RegExp(`^${name}\\b`) })
const stripeRow = (page: Page) =>
  main(page).getByRole("region", { name: "Connected data" }).getByRole("listitem", { name: "Stripe" })
const metricsHeaderTag = (page: Page) => main(page).locator("header").first().getByTestId("sample-data-tag")
const ticker = (page: Page) => page.getByTestId("subscriber-ticker").filter({ visible: true })
const spoken = (page: Page) => ticker(page).getByRole("status").locator(".sr-only")

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/* ---------------------------------------------------- the real endpoints */

test.describe("server endpoints with no key", () => {
  test("/api/stripe/summary is not_connected — no figures, no error text", async ({ request }) => {
    const res = await request.get("/api/stripe/summary?tz=America/Chicago")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.json()).toEqual({ status: "not_connected", lastSyncedAt: null, metrics: null })
  })

  test("/api/health/stripe says only not_configured", async ({ request }) => {
    const res = await request.get("/api/health/stripe")
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe('{"stripe":"not_configured"}')
  })
})

/* ------------------------------------------------------- not connected */

test.describe("Stripe not connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Home: the Stripe tiles show sample figures, labelled", async ({ page }) => {
    await open(page, "/home")
    for (const name of ["Subscribers", "Cash this week"]) {
      await expect(kpi(page, name)).toHaveAttribute("data-source", "sample")
      await expect(kpi(page, name).getByTestId("sample-data-tag")).toBeVisible()
    }
    await expect(strip(page).getByTestId("kpi-sample-label")).toBeVisible()
    await expect(ticker(page).getByTestId("sample-data-tag")).toBeVisible()
    await expect(main(page).getByText(/Last updated/)).toHaveCount(0)
  })

  test("Metrics: every card is sample, labelled", async ({ page }) => {
    await open(page, "/metrics")
    for (const name of ["MRR", "Churn Rate", "Trial Conversions", "Subscribers", "ARR"]) {
      await expect(metricCard(page, name)).toHaveAttribute("data-source", "sample")
      await expect(metricCard(page, name).getByTestId("sample-data-tag")).toBeVisible()
    }
    await expect(page.getByTestId("sample-data-notice")).toContainText("Nothing is connected to Stripe")
    await expect(page.getByRole("note", { name: "Sample data" })).toContainText(/^Sample data\./)
    await expect(metricsHeaderTag(page)).toHaveText("Sample data")
  })

  test("Settings: Stripe and every other source say Not connected", async ({ page }) => {
    await open(page, "/settings")
    await expect(stripeRow(page)).toContainText("Not connected")
    await expect(
      main(page).getByRole("region", { name: "Connected data" }).getByText("Not connected", { exact: true })
    ).toHaveCount(4)
  })
})

/* ------------------------------------------------------------ connected */

test.describe("Stripe connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Home: ticker, Subscribers and Cash this week are live and unlabelled", async ({ page }) => {
    const zones = await mockStripe(page, liveSummary("connected"))
    await open(page, "/home")
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "stripe")
    await expect(kpi(page, "Subscribers")).toContainText("1,284")
    await expect(kpi(page, "Subscribers")).toContainText("+34 vs previous 28 days")
    await expect(kpi(page, "Cash this week")).toContainText("$4,322")
    await expect(kpi(page, "Cash this week")).toContainText("vs same time last week")
    await expect(strip(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(strip(page).getByTestId("kpi-sample-label")).toHaveCount(0)
    await expect(spoken(page)).toHaveText("Subscribers: 1,284, up 3 today")
    await expect(ticker(page).getByTestId("sample-data-tag")).toHaveCount(0)
    // Asked in the founder's zone (Central by default).
    expect(zones[0]).toBe("America/Chicago")
  })

  test("Metrics: MRR, churn, trial-to-paid and Subscribers live; the rest sample", async ({ page }) => {
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/metrics")
    const live = { MRR: "$61,235", "Churn Rate": "2.7%", "Trial Conversions": "41.2%", Subscribers: "1,284" }
    for (const [name, value] of Object.entries(live)) {
      await expect(metricCard(page, name)).toHaveAttribute("data-source", "stripe")
      await expect(metricCard(page, name).getByTestId("metric-value")).toHaveText(value)
      await expect(metricCard(page, name).getByTestId("sample-data-tag")).toHaveCount(0)
    }
    for (const name of ["ARR", "Revenue", "Retention", "Expenses"]) {
      await expect(metricCard(page, name).getByTestId("sample-data-tag")).toBeVisible()
    }
    const notice = page.getByRole("note", { name: "Partly live" })
    await expect(notice).toContainText(/^Partly live\. MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe/)
    await expect(notice).not.toContainText("Sample data")
    // The page is not all sample any more: the header chip goes.
    await expect(metricsHeaderTag(page)).toHaveCount(0)
  })

  test("Settings: Stripe Connected, with the last sync on the shared clock", async ({ page }) => {
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/settings")
    await expect(stripeRow(page).getByTestId("stripe-status")).toHaveText("Connected")
    await expect(stripeRow(page).getByTestId("stripe-detail")).toHaveText(
      "Read-only · last synced Tue, Oct 13 · 9:41 AM CDT"
    )
    const others = main(page).getByRole("region", { name: "Connected data" }).getByText("Not connected", { exact: true })
    await expect(others).toHaveCount(3)
  })

  test("a saved time zone is what the page asks Stripe's figures in", async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "America/Los_Angeles" })] as const
    )
    const zones = await mockStripe(page, liveSummary("connected"))
    await open(page, "/settings")
    await expect(stripeRow(page).getByTestId("stripe-detail")).toHaveText(
      "Read-only · last synced Tue, Oct 13 · 7:41 AM PDT"
    )
    expect(zones).toContain("America/Los_Angeles")
  })
})

/* ---------------------------------------------------------------- stale */

test.describe("Stripe stale (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Home: last figures, unlabelled, with Last updated", async ({ page }) => {
    await mockStripe(page, liveSummary("stale"))
    await open(page, "/home")
    for (const name of ["Subscribers", "Cash this week"]) {
      await expect(kpi(page, name).getByTestId("kpi-updated")).toHaveText("Last updated Tue, Oct 13 · 9:41 AM CDT")
      await expect(kpi(page, name).getByTestId("sample-data-tag")).toHaveCount(0)
    }
    await expect(ticker(page)).toHaveAttribute("data-state", "stale")
    await expect(ticker(page).getByText("Last updated 9:41 AM CDT", { exact: true })).toBeVisible()
  })

  test("Metrics: the live cards say Last updated", async ({ page }) => {
    await mockStripe(page, liveSummary("stale"))
    await open(page, "/metrics")
    for (const name of ["MRR", "Churn Rate", "Trial Conversions", "Subscribers"]) {
      await expect(metricCard(page, name).getByTestId("metric-updated")).toHaveText("Last updated Tue, Oct 13 · 9:41 AM CDT")
    }
    await expect(metricCard(page, "ARR").getByTestId("metric-updated")).toHaveCount(0)
    await expect(page.getByRole("note", { name: "Partly live" })).toContainText("as of their last update")
    await expect(metricsHeaderTag(page)).toHaveCount(0)
  })

  test("Settings: Stripe shows Last updated <time>", async ({ page }) => {
    await mockStripe(page, liveSummary("stale"))
    await open(page, "/settings")
    await expect(stripeRow(page).getByTestId("stripe-status")).toHaveText("Last updated Tue, Oct 13 · 9:41 AM CDT")
  })

  test("our endpoint failing after a good read keeps the figures and turns stale — never an error", async ({ page }) => {
    let fail = false
    await page.route("**/api/stripe/summary**", (route) =>
      fail ? route.fulfill({ status: 500, body: "boom" }) : route.fulfill({ json: liveSummary("connected") })
    )
    await page.clock.install()
    await open(page, "/home")
    await expect(kpi(page, "Subscribers")).toContainText("1,284")
    fail = true
    await page.clock.runFor(61_000)
    await expect(kpi(page, "Subscribers").getByTestId("kpi-updated")).toHaveText(/^Last updated /)
    await expect(kpi(page, "Subscribers")).toContainText("1,284")
    await expect(main(page).getByText(/boom|error/i)).toHaveCount(0)
  })
})

/* ----------------------------------------------------------- responsive */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
] as const

for (const vp of VIEWPORTS) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`Stripe stale at ${vp.width} ${theme}`, () => {
      test.use({ viewport: vp })

      test("Home and Settings: nothing lost, readable, 44px targets, no sideways scroll", async ({ page }) => {
        await mockStripe(page, liveSummary("stale"))
        await open(page, "/home")
        await setTheme(page, theme)
        for (const name of ["Subscribers", "Cash this week"]) {
          const card = kpi(page, name)
          await expect(card).toBeVisible()
          await expect(card.getByTestId("kpi-updated")).toBeVisible()
          await expectReadable(card, `${theme}/${vp.width} ${name}`, expect)
        }
        await expect(ticker(page)).toHaveCount(1)
        await expectTapTarget(ticker(page).getByRole("link"), `${theme}/${vp.width} ticker link`)
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

        await open(page, "/settings")
        const row = stripeRow(page)
        await expect(row.getByTestId("stripe-status")).toBeVisible()
        await expectReadable(row, `${theme}/${vp.width} Stripe row`, expect)
        const badge = await row.getByTestId("stripe-status").boundingBox()
        expect(badge!.x + badge!.width, "badge inside the viewport").toBeLessThanOrEqual(vp.width)
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      })

      test("Metrics: the live cards keep value, Last updated and chart controls", async ({ page }) => {
        await mockStripe(page, liveSummary("stale"))
        await open(page, "/metrics")
        await setTheme(page, theme)
        const mrr = metricCard(page, "MRR")
        await expect(mrr.getByTestId("metric-value")).toHaveText("$61,235")
        await expect(mrr.getByTestId("metric-updated")).toBeVisible()
        await expectReadable(mrr, `${theme}/${vp.width} MRR card`, expect)
        const bar = await mrr.getByRole("button", { name: "MRR: bar chart" }).boundingBox()
        expect(bar!.height).toBeGreaterThanOrEqual(MIN_TAP)
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      })
    })
  }
}
