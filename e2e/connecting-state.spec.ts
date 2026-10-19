import { expect, test, type Page } from "@playwright/test"

import { APP_STORE_CONNECTING, LIVE_METRICS, connectingSummary, liveSummary } from "../src/test/stripe-fixture"
import type { StripeSummary } from "../src/lib/stripe-summary"
import { waitForHydration } from "./support/shell"
import { mockStripe } from "./support/stripe"

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
  })

  test("Metrics: the Stripe cards carry no Sample label", async ({ page }) => {
    await mockStripe(page, connectingSummary())
    await open(page, "/metrics")
    for (const name of ["MRR", "Churn Rate", "Trial Conversions", "Subscribers"]) {
      await expect(metricCard(page, name).getByTestId("sample-data-tag")).toHaveCount(0)
    }
  })

  test("Settings: Stripe says Connecting…, not Not connected", async ({ page }) => {
    await mockStripe(page, connectingSummary())
    await open(page, "/settings")
    await expect(stripeRow(page).getByTestId("stripe-status")).toHaveText("Connecting…")
    await expect(stripeRow(page).getByTestId("stripe-detail")).toContainText("first sync in progress")
    await expect(stripeRow(page)).not.toContainText("Not connected")
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

  test("is still the honest Not connected, with the labelled sample", async ({ page }) => {
    await open(page, "/settings")
    await expect(stripeRow(page)).toContainText("Not connected")
    await open(page, "/home")
    await expect(kpi(page, "Subscribers")).toHaveAttribute("data-source", "sample")
  })
})
