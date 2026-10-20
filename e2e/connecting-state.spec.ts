import { expect, test, type Page } from "@playwright/test"

import { APP_STORE_CONNECTING, LIVE_METRICS, connectingSummary, liveSummary } from "../src/test/stripe-fixture"
import type { StripeSummary } from "../src/lib/stripe-summary"
import { waitForHydration } from "./support/shell"
import { expectReadable } from "./support/contrast"
import { mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"
import { OTHER_CARDS_TEXT, STRIPE_CONNECTING_TEXT } from "../src/components/metrics/metrics-sample-notice"

/**
 * "Connecting": the server has a key and its first sync is still running
 * (a fresh server just after a deploy). Every Stripe-fed surface is a
 * placeholder — never the sample figures as if live — and the figures land
 * on the next poll once the sync finishes. Mocked in the browser: e2e never
 * has a key, and nothing here reaches Stripe or Chlk's database.
 */

const main = (page: Page) => page.getByRole("main")
const strip = (page: Page) => main(page).getByRole("region", { name: "KPI strip" })
const kpi = (page: Page, name: string) => strip(page).getByRole("article", { name, exact: true })
const ticker = (page: Page) => page.getByTestId("subscriber-ticker").filter({ visible: true })
const stripeRow = (page: Page) =>
  main(page).getByRole("region", { name: "Connected data" }).getByRole("listitem", { name: "Stripe" })
const metricCard = (page: Page, name: string) =>
  main(page).getByRole("region", { name: "Metric cards" }).getByRole("article", { name: new RegExp(`^${name}\\b`) })

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/** Answer `first` until `switchAfter` requests have been served, then `then`. */
async function mockSequence(page: Page, first: StripeSummary, then: StripeSummary, switchAfter = 1) {
  let served = 0
  await page.route("**/api/stripe/summary**", async (route) => {
    served += 1
    await route.fulfill({ json: served <= switchAfter ? first : then, headers: { "Cache-Control": "no-store" } })
  })
}

test.describe("Stripe connecting (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Home: headline, Cash this week and ticker are placeholders, with no Sample label", async ({ page }) => {
    await mockStripe(page, connectingSummary())
    await open(page, "/home")
    for (const name of ["Subscribers", "Cash this week"]) {
      await expect(kpi(page, name)).toHaveAttribute("data-source", "loading")
      await expect(kpi(page, name)).toHaveAttribute("aria-busy", "true")
      await expect(kpi(page, name).getByTestId("sample-data-tag")).toHaveCount(0)
    }
    await expect(strip(page).getByTestId("kpi-sample-label")).toHaveCount(0)
    await expect(ticker(page)).toHaveAttribute("data-state", "loading")
    await expect(ticker(page).getByTestId("sample-data-tag")).toHaveCount(0)
    // Home's own copy of the connecting state: Connecting…, never Not connected.
    for (const name of ["Subscribers", "Cash this week"]) {
      await expect(kpi(page, name).getByTestId("connecting")).toHaveText("Connecting…")
    }
    await expect(ticker(page).getByTestId("connecting")).toBeVisible()
    await expect(page.getByRole("region", { name: "Metrics" }).getByTestId("connecting")).toBeVisible()
    await expect(page.locator("main").getByTestId("not-connected").filter({ visible: true })).toHaveCount(3) // Workplace + Inbox doors + Paying coaches (no database URL here)
  })

  test("Metrics: the Stripe cards carry no Sample label", async ({ page }) => {
    await mockStripe(page, connectingSummary())
    await open(page, "/metrics")
    for (const name of ["MRR", "Churn Rate", "Trial Conversions", "Subscribers"]) {
      await expect(metricCard(page, name).getByTestId("sample-data-tag")).toHaveCount(0)
    }
    const notice = main(page).getByTestId("metrics-connection-notice")
    await expect(notice).toContainText("Stripe’s first sync is in progress")
    await expect(notice).not.toContainText(/nothing is connected/i)
  })

  test("Settings: Stripe says Connecting…, not Not connected", async ({ page }) => {
    await mockStripe(page, connectingSummary())
    await open(page, "/settings")
    await expect(stripeRow(page).getByTestId("stripe-status")).toHaveText("Connecting…")
    await expect(stripeRow(page).getByTestId("stripe-detail")).toContainText("first sync in progress")
    await expect(stripeRow(page)).not.toContainText("Not connected")
    const sample = main(page).getByRole("region", { name: "Sample data" })
    await expect(sample).toContainText("Stripe is connecting (first sync in progress)")
    await expect(sample).not.toContainText(/nothing is connected/i)
  })

  test("the figures land on the next poll once the first sync finishes", async ({ page }) => {
    await mockSequence(page, connectingSummary(), liveSummary("connected"))
    await open(page, "/home")
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "loading")
    // The browser asks again within ~5 s while connecting (not the minute it waits once live).
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "stripe", { timeout: 15_000 })
    await expect(kpi(page, "Subscribers").getByText("1,337")).toBeVisible()
    await expect(ticker(page)).toHaveAttribute("data-state", "ready")
  })

  test("Stripe live, App Store connecting: the headline waits, Cash this week is live", async ({ page }) => {
    await mockStripe(page, liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING))
    await open(page, "/home")
    await expect(kpi(page, "Cash this week")).toHaveAttribute("data-source", "stripe")
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "loading")
    await expect(ticker(page)).toHaveAttribute("data-state", "loading")
  })
})

test.describe("no key at all (the real server)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("is still the honest Not connected (Settings and Home)", async ({ page }) => {
    await open(page, "/settings")
    await expect(stripeRow(page)).toContainText("Not connected")
    await open(page, "/home")
    // Home carries no sample data: no key reads as Not connected there.
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "not_connected")
    await expect(kpi(page, "Subscribers").getByTestId("not-connected")).toBeVisible()
  })
})

/* --------------------------------------------- connecting copy, readable */

// The page's own constants, so the copy here cannot drift from the screen.
const NOTICE_COPY = `Connecting. ${STRIPE_CONNECTING_TEXT}. PostHog is not connected yet. ${OTHER_CARDS_TEXT}`
const SETTINGS_COPY = "Stripe is connecting (first sync in progress); its cards say Connecting\u2026 until then."

for (const width of [390, 820, 1440] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`connecting copy at ${width} ${theme}`, () => {
      test.use({ viewport: { width, height: width === 390 ? 844 : 900 } })

      test("Metrics notice says Connecting, readable; the header chip is hidden", async ({ page }) => {
        await mockStripe(page, connectingSummary())
        await open(page, "/metrics")
        await setTheme(page, theme)
        const notice = main(page).getByTestId("metrics-connection-notice")
        await expect(notice).toContainText(NOTICE_COPY)
        await expect(notice).not.toContainText(/nothing is connected/i)
        await expectReadable(notice, `metrics connecting notice ${width} ${theme}`, expect)
        await expect(main(page).locator("header").first().getByTestId("sample-data-tag")).toHaveCount(0)
      })

      test("Settings › Sample data says Stripe is connecting, readable", async ({ page }) => {
        await mockStripe(page, connectingSummary())
        await open(page, "/settings")
        await setTheme(page, theme)
        const section = main(page).getByRole("region", { name: "Sample data" })
        await expect(section).toContainText(SETTINGS_COPY)
        await expect(section).not.toContainText(/every (other )?number is still sample/i)
        await expectReadable(section, `settings connecting copy ${width} ${theme}`, expect)
        await expect(stripeRow(page).getByTestId("stripe-status")).toHaveText("Connecting…")
      })
    })
  }
}

/* ------------------------------------- our endpoint fails while connecting */

/** `first` once, then a 500 for every later poll. */
async function connectingThenError(page: Page, first: StripeSummary) {
  let served = 0
  await page.route("**/api/stripe/summary**", async (route) => {
    served += 1
    if (served === 1) await route.fulfill({ json: first, headers: { "Cache-Control": "no-store" } })
    else await route.fulfill({ status: 500, body: "" })
  })
}

test.describe("our endpoint fails after connecting (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Stripe connecting, then 500: Not connected, not Connecting… forever", async ({ page }) => {
    await connectingThenError(page, connectingSummary())
    await open(page, "/settings")
    await expect(stripeRow(page).getByTestId("stripe-status")).toHaveText("Connecting…")
    // The next poll (~5 s while connecting) fails.
    await expect(stripeRow(page)).toContainText("Not connected", { timeout: 15_000 })
  })

  test("Stripe live, App Store connecting, then 500: stale figures, App Store Not connected", async ({ page }) => {
    await connectingThenError(page, liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING))
    await open(page, "/home")
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "loading")
    // App Store no longer on its way: the total shows without it, and says so.
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "stripe", { timeout: 15_000 })
    await expect(kpi(page, "Subscribers")).toContainText("1,284")
    await expect(kpi(page, "Subscribers")).toContainText("Total excludes App Store (not connected)")
  })
})
