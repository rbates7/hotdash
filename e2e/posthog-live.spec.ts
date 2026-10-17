import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"
import { livePosthogSummary, mockPosthog } from "./support/posthog"
import { liveSummary, mockStripe } from "./support/stripe"

/**
 * Live PostHog, three states, on Metrics and Settings. e2e never has a
 * PostHog key: "not connected" is the real server with none; "connected"
 * and "stale" mock /api/posthog/summary in the browser. Nothing here
 * reaches PostHog.
 */

const main = (page: Page) => page.getByRole("main")
const grid = (page: Page) => main(page).getByRole("region", { name: "Metric cards" })
const metricCard = (page: Page, name: string) => grid(page).getByRole("article", { name: new RegExp(`^${name}\\b`) })
const posthogRow = (page: Page) =>
  main(page).getByRole("region", { name: "Connected data" }).getByRole("listitem", { name: "PostHog" })
const metricsHeaderTag = (page: Page) => main(page).locator("header").first().getByTestId("sample-data-tag")

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

async function addActiveUsers(page: Page) {
  await main(page).getByRole("button", { name: "Add metric", exact: true }).click()
  await page.getByRole("dialog", { name: "Add a metric" }).getByRole("button", { name: /^Active Users/ }).click()
}

/* ---------------------------------------------------- the real endpoints */

test.describe("server endpoints with no PostHog key", () => {
  test("/api/health/posthog says only not_configured", async ({ request }) => {
    const res = await request.get("/api/health/posthog")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.text()).toBe('{"posthog":"not_configured"}')
  })

  test("/api/posthog/summary is not_connected — no figures, no error text", async ({ request }) => {
    const res = await request.get("/api/posthog/summary")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.json()).toEqual({ status: "not_connected", lastSyncedAt: null, metrics: null })
  })
})

/* ------------------------------------------------------- not connected */

test.describe("PostHog not connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Metrics: Retention and Active Users are sample, labelled", async ({ page }) => {
    await open(page, "/metrics")
    await expect(metricCard(page, "Retention")).toHaveAttribute("data-source", "sample")
    await expect(metricCard(page, "Retention").getByTestId("sample-data-tag")).toBeVisible()
    await addActiveUsers(page)
    await expect(metricCard(page, "Active Users")).toHaveAttribute("data-source", "sample")
    await expect(metricCard(page, "Active Users").getByTestId("sample-data-tag")).toBeVisible()
    await expect(page.getByTestId("sample-data-notice")).toContainText("Nothing is connected to Stripe, Supabase or PostHog")
    await expect(main(page).getByText(/Last updated/)).toHaveCount(0)
  })

  test("Settings: PostHog says Not connected", async ({ page }) => {
    await open(page, "/settings")
    await expect(posthogRow(page)).toContainText("Not connected")
    await expect(posthogRow(page).getByTestId("posthog-status")).toHaveCount(0)
  })
})

/* ------------------------------------------------------------ connected */

test.describe("PostHog connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Metrics: Retention and Active Users live and unlabelled; the rest sample", async ({ page }) => {
    await mockPosthog(page, livePosthogSummary("connected"))
    await open(page, "/metrics")
    const retention = metricCard(page, "Retention")
    await expect(retention).toHaveAttribute("data-source", "posthog")
    await expect(retention.getByTestId("metric-value")).toHaveText("58.4%")
    await expect(retention.getByTestId("metric-live-note")).toHaveText("iOS app · 452 of 774 users came back")
    await expect(retention.getByTestId("sample-data-tag")).toHaveCount(0)

    await addActiveUsers(page)
    const active = metricCard(page, "Active Users")
    await expect(active).toHaveAttribute("data-source", "posthog")
    await expect(active.getByTestId("metric-value")).toHaveText("812")
    await expect(active.getByTestId("metric-live-note")).toHaveText("iOS app · 214 in 24 h · 455 in 7 days")

    for (const name of ["MRR", "ARR", "Churn Rate", "Expenses"]) {
      await expect(metricCard(page, name).getByTestId("sample-data-tag")).toBeVisible()
    }
    const notice = page.getByRole("note", { name: "Partly live" })
    await expect(notice).toContainText(/^Partly live\. Retention and Active Users are live from PostHog/)
    await expect(notice).toContainText("Stripe and Supabase are not connected yet")
    await expect(metricsHeaderTag(page)).toHaveCount(0)
  })

  test("Metrics with Stripe live too: the notice names both sources", async ({ page }) => {
    await mockPosthog(page, livePosthogSummary("connected"))
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/metrics")
    await expect(metricCard(page, "MRR")).toHaveAttribute("data-source", "stripe")
    await expect(metricCard(page, "Retention")).toHaveAttribute("data-source", "posthog")
    await expect(page.getByRole("note", { name: "Partly live" })).toContainText(
      "live from Stripe (read-only); Subscribers also counts App Store payers from Chlk’s database (read-only); Retention and Active Users are live from PostHog"
    )
  })

  test("Settings: PostHog Connected, with the last sync on the shared clock", async ({ page }) => {
    await mockPosthog(page, livePosthogSummary("connected"))
    await open(page, "/settings")
    await expect(posthogRow(page).getByTestId("posthog-status")).toHaveText("Connected")
    await expect(posthogRow(page).getByTestId("posthog-detail")).toHaveText("Read-only · last synced Tue, Oct 13 · 9:41 AM CDT")
    const others = main(page).getByRole("region", { name: "Connected data" }).getByText("Not connected", { exact: true })
    await expect(others).toHaveCount(3)
  })
})

/* ---------------------------------------------------------------- stale */

test.describe("PostHog stale (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Metrics: the live cards say Last updated", async ({ page }) => {
    await mockPosthog(page, livePosthogSummary("stale"))
    await open(page, "/metrics")
    await expect(metricCard(page, "Retention").getByTestId("metric-updated")).toHaveText("Last updated Tue, Oct 13 · 9:41 AM CDT")
    await expect(metricCard(page, "Retention").getByTestId("metric-value")).toHaveText("58.4%")
    await expect(metricCard(page, "ARR").getByTestId("metric-updated")).toHaveCount(0)
    await expect(page.getByRole("note", { name: "Partly live" })).toContainText("as of their last update")
  })

  test("Settings: PostHog shows Last updated <time>", async ({ page }) => {
    await mockPosthog(page, livePosthogSummary("stale"))
    await open(page, "/settings")
    await expect(posthogRow(page).getByTestId("posthog-status")).toHaveText("Last updated Tue, Oct 13 · 9:41 AM CDT")
  })

  test("our endpoint failing after a good read keeps the figures and turns stale — never an error", async ({ page }) => {
    let fail = false
    await page.route("**/api/posthog/summary**", (route) =>
      fail ? route.fulfill({ status: 500, body: "boom" }) : route.fulfill({ json: livePosthogSummary("connected") })
    )
    await page.clock.install()
    await open(page, "/metrics")
    await expect(metricCard(page, "Retention").getByTestId("metric-value")).toHaveText("58.4%")
    fail = true
    await page.clock.runFor(61_000)
    await expect(metricCard(page, "Retention").getByTestId("metric-updated")).toHaveText(/^Last updated /)
    await expect(metricCard(page, "Retention").getByTestId("metric-value")).toHaveText("58.4%")
    await expect(main(page).getByText(/boom|error/i)).toHaveCount(0)
  })
})

/* ------------------------------------------------- below 1280: a11y bars */

for (const vp of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`PostHog's new text and targets (${vp.width} ${theme})`, () => {
      test.use({ viewport: vp })

      test("Metrics: notes and Last updated clear 4.5:1; Active Users in the picker is a 44 px target", async ({ page }) => {
        await mockPosthog(page, livePosthogSummary("stale"))
        await open(page, "/metrics")
        await setTheme(page, theme)
        await main(page).getByRole("button", { name: "Add metric", exact: true }).click()
        const picker = page.getByRole("dialog", { name: "Add a metric" })
        if (vp.width < 768) {
          await expect(picker).toContainText("Live where connected; the rest are sample figures.")
          await expect(picker).not.toContainText("removed. Sample figures.")
        }
        const choice = picker.getByRole("button", { name: /^Active Users/ })
        // Polled: the popover opens with a short zoom-in.
        await expect.poll(async () => (await choice.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
        await choice.click()
        for (const name of ["Retention", "Active Users"]) {
          for (const id of ["metric-live-note", "metric-updated"]) {
            await expectReadable(metricCard(page, name).getByTestId(id), `${name} ${id}`, expect)
          }
        }
      })

      test("Settings: PostHog's status and detail clear 4.5:1", async ({ page }) => {
        await mockPosthog(page, livePosthogSummary("connected"))
        await open(page, "/settings")
        await setTheme(page, theme)
        await expectReadable(posthogRow(page).getByTestId("posthog-status"), "posthog-status", expect)
        await expectReadable(posthogRow(page).getByTestId("posthog-detail"), "posthog-detail", expect)
      })
    })
  }
}
