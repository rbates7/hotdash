import { expect, test, type Page } from "@playwright/test"

import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/lib/settings"
import { expectReadable } from "./support/contrast"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { APP_STORE_OFF, APP_STORE_ZERO, APP_STORE_ZERO_STALE, LIVE_METRICS, liveSummary, mockStripe } from "./support/stripe"
import { MIN_TAP, expectTapTarget } from "./support/tap-target"
import { setTheme } from "./support/theme"

/**
 * Live Stripe, three states, three screens, and the App Store count beside
 * it (connected or not). e2e never has a Stripe key or a database URL:
 * "not connected" is the real server with neither; "connected" and
 * "stale" mock /api/stripe/summary in the browser. Nothing here reaches
 * Stripe or Chlk's database.
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
const breakdownRows = (scope: ReturnType<Page["locator"]>) =>
  scope.getByTestId("subscriber-breakdown").locator("[data-row]")

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/* ---------------------------------------------------- the real endpoints */

test.describe("server endpoints with no key", () => {
  test("/api/stripe/summary is not_connected, App Store too — no figures, no error text", async ({ request }) => {
    const res = await request.get("/api/stripe/summary?tz=America/Chicago")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.json()).toEqual({
      status: "not_connected",
      lastSyncedAt: null,
      metrics: null,
      appStore: { status: "not_connected" },
    })
  })

  test("/api/health/stripe says only not_configured", async ({ request }) => {
    const res = await request.get("/api/health/stripe")
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe('{"stripe":"not_configured"}')
  })

  test("/api/health/app-store says only not_connected, never cached", async ({ request }) => {
    const res = await request.get("/api/health/app-store")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.text()).toBe('{"appStore":"not_connected"}')
  })
})

/* ------------------------------------------------------- not connected */

test.describe("Stripe not connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Home: the Stripe tiles and ticker say Not connected, with no figures", async ({ page }) => {
    await open(page, "/home")
    for (const name of ["Subscribers", "Cash this week"]) {
      await expect(kpi(page, name)).toHaveAttribute("data-source", "not_connected")
      await expect(kpi(page, name).getByTestId("not-connected")).toBeVisible()
      await expect(kpi(page, name).getByTestId("sample-data-tag")).toHaveCount(0)
    }
    await expect(strip(page).getByTestId("kpi-sample-label")).toHaveCount(0)
    await expect(ticker(page)).toHaveAttribute("data-state", "not_connected")
    await expect(ticker(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(main(page).getByText(/Last updated/)).toHaveCount(0)
    await expect(kpi(page, "Subscribers").getByTestId("subscriber-breakdown")).toHaveCount(0)
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
    await expect(kpi(page, "Subscribers")).toContainText("1,337")
    await expect(kpi(page, "Subscribers")).toContainText("+34 vs previous 28 days")
    await expect(kpi(page, "Cash this week")).toContainText("$4,322")
    await expect(kpi(page, "Cash this week")).toContainText("vs same time last week")
    await expect(strip(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(strip(page).getByTestId("kpi-sample-label")).toHaveCount(0)
    await expect(spoken(page)).toHaveText("Subscribers: 1,337, up 3 today")
    await expect(ticker(page).getByTestId("sample-data-tag")).toHaveCount(0)
    // Asked in the founder's zone (Central by default).
    expect(zones[0]).toBe("America/Chicago")
  })

  test("Metrics: MRR, churn, trial-to-paid and Subscribers live; the rest sample", async ({ page }) => {
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/metrics")
    const live = { MRR: "$61,235", "Churn Rate": "2.7%", "Trial Conversions": "41.2%", Subscribers: "1,337" }
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
    await expect(kpi(page, "Subscribers")).toContainText("1,337")
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
    await expect(kpi(page, "Subscribers")).toContainText("1,337")
    fail = true
    await page.clock.runFor(61_000)
    await expect(kpi(page, "Subscribers").getByTestId("kpi-updated")).toHaveText(/^Last updated /)
    await expect(kpi(page, "Subscribers")).toContainText("1,337")
    await expect(main(page).getByText(/boom|error/i)).toHaveCount(0)
  })
})

/* ------------------------------------------- the Subscribers total (1440) */

const ROWS_CONNECTED = [
  ["Stripe paying", "1,110"],
  ["App Store", "53"],
  ["Free (never paid)", "174"],
]

async function rowsOf(scope: ReturnType<Page["locator"]>) {
  const rows = breakdownRows(scope)
  await expect(rows).toHaveCount(3)
  return Promise.all(
    (await rows.all()).map(async (r) => [await r.locator("dt").innerText(), await r.locator("dd").innerText()])
  )
}

test.describe("Subscribers total, App Store connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Home card, ticker and Metrics card all show 1,337 = 1,110 + 53 + 174", async ({ page }) => {
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/home")
    const card = kpi(page, "Subscribers")
    await expect(card).toContainText("1,337")
    expect(await rowsOf(card)).toEqual(ROWS_CONNECTED)
    await expect(card.getByTestId("subscriber-breakdown-note")).toHaveText("")
    // Each tile paints its digit twice (top and bottom halves): 1,337.
    await expect(ticker(page).getByTestId("ticker-tiles")).toHaveText("11,333377")

    await open(page, "/metrics")
    const metrics = metricCard(page, "Subscribers")
    await expect(metrics.getByTestId("metric-value")).toHaveText("1,337")
    expect(await rowsOf(metrics)).toEqual(ROWS_CONNECTED)
    await expect(page.getByRole("note", { name: "Partly live" })).toContainText("App Store payers from Chlk’s database")
  })

  test("ticker: the breakdown is its accessible description and a tooltip on hover and keyboard focus; the live region speaks the total only", async ({
    page,
  }) => {
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/home")
    const link = ticker(page).getByRole("link")
    await expect(link).toHaveAccessibleName("Subscribers: 1,337, up 3 today")
    await expect(link).toHaveAccessibleDescription("Stripe paying 1,110, App Store 53, Free (never paid) 174.")
    await expect(spoken(page)).toHaveText("Subscribers: 1,337, up 3 today")

    const tip = page.getByTestId("ticker-breakdown")
    const before = await ticker(page).boundingBox()
    await link.hover()
    await expect(tip).toBeVisible()
    await expect(tip).toContainText("Stripe paying1,110")
    // Portalled: opening it moves nothing in the header.
    expect(await ticker(page).boundingBox()).toEqual(before)
    await page.mouse.move(1, 1)
    await expect(tip).toBeHidden()

    await link.focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    await expect(link).toBeFocused()
    await expect(tip).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(tip).toBeHidden()
  })

  test("ticker: a click still goes to Metrics › New Subscribers", async ({ page }) => {
    await mockStripe(page, liveSummary("connected"))
    await open(page, "/home")
    await ticker(page).getByRole("link").click()
    await expect(page).toHaveURL(/\/metrics\?tab=new$/)
  })
})

test.describe("Subscribers total, App Store not connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("the total is Stripe paying + free, the App Store row says Not connected, and the total says it excludes it", async ({
    page,
  }) => {
    await mockStripe(page, liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
    await open(page, "/home")
    const card = kpi(page, "Subscribers")
    await expect(card).toContainText("1,284")
    expect(await rowsOf(card)).toEqual([
      ["Stripe paying", "1,110"],
      ["App Store", "Not connected"],
      ["Free (never paid)", "174"],
    ])
    await expect(card.getByTestId("subscriber-breakdown-note")).toHaveText("Total excludes App Store (not connected)")
    await expect(card).not.toContainText(/App Store\s*0\b/)
    const link = ticker(page).getByRole("link")
    await expect(link).toHaveAccessibleDescription(
      "Stripe paying 1,110, App Store Not connected, Free (never paid) 174. Total excludes App Store (not connected)."
    )
    await link.hover()
    await expect(page.getByTestId("ticker-breakdown")).toContainText("Total excludes App Store (not connected)")

    await open(page, "/metrics")
    const metrics = metricCard(page, "Subscribers")
    await expect(metrics.getByTestId("metric-value")).toHaveText("1,284")
    await expect(metrics.getByTestId("subscriber-breakdown-note")).toHaveText("Total excludes App Store (not connected)")
    const notice = page.getByRole("note", { name: "Partly live" })
    await expect(notice).not.toContainText("App Store")
  })
})

const SUSPECT_NOTE = "App Store read 0 — check database access (likely a permissions/RLS issue)"

test.describe("Subscribers total, App Store read 0 — suspect (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the App Store row warns instead of saying 0, and the total leaves it out (Home, ticker, Metrics)`, async ({
      page,
    }) => {
      await mockStripe(page, liveSummary("connected", LIVE_METRICS, APP_STORE_ZERO))
      await open(page, "/home")
      await setTheme(page, theme)
      const card = kpi(page, "Subscribers")
      await expect(card).toContainText("1,284")
      expect(await rowsOf(card)).toEqual([
        ["Stripe paying", "1,110"],
        ["App Store", "Check source"],
        ["Free (never paid)", "174"],
      ])
      const row = card.locator("[data-row='appStore']")
      await expect(row).toHaveAttribute("data-warning", "")
      await expect(row.getByRole("img", { name: "Warning: App Store count is suspect" })).toBeVisible()
      await expect(card.getByTestId("subscriber-breakdown-note")).toHaveText(SUSPECT_NOTE)
      await expect(card).not.toContainText(/App Store\s*0\b/)
      await expectReadable(card.getByTestId("subscriber-breakdown"), `${theme} suspect breakdown`, expect)

      const link = ticker(page).getByRole("link")
      await expect(link).toHaveAccessibleName("Subscribers: 1,284, up 3 today")
      await expect(link).toHaveAccessibleDescription(
        `Stripe paying 1,110, App Store Check source (warning), Free (never paid) 174. ${SUSPECT_NOTE}.`
      )
      await link.hover()
      const tip = page.getByTestId("ticker-breakdown")
      await expect(tip.locator("[data-warning]")).toContainText("Check source")
      await expect(tip.getByRole("img", { name: "Warning: App Store count is suspect" })).toBeVisible()
      // The warning and its note (the other labels are the tooltip's existing 75% secondary text).
      await expectReadable(tip.locator("[data-warning] dd"), `${theme} suspect tooltip row`, expect)
      await expectReadable(tip.getByText(SUSPECT_NOTE), `${theme} suspect tooltip note`, expect)

      await open(page, "/metrics")
      await setTheme(page, theme)
      const metrics = metricCard(page, "Subscribers")
      await expect(metrics.getByTestId("metric-value")).toHaveText("1,284")
      expect(await rowsOf(metrics)).toEqual([
        ["Stripe paying", "1,110"],
        ["App Store", "Check source"],
        ["Free (never paid)", "174"],
      ])
      await expect(metrics.locator("[data-row='appStore']").getByRole("img", { name: "Warning: App Store count is suspect" })).toBeVisible()
      await expect(metrics.getByTestId("subscriber-breakdown-note")).toHaveText(SUSPECT_NOTE)
      await expectReadable(metrics.getByTestId("subscriber-breakdown"), `${theme} suspect Metrics breakdown`, expect)
      const notice = page.getByRole("note", { name: "Partly live" })
      await expect(notice).not.toContainText("also counts App Store payers")
      await expect(notice).toContainText("leaves out App Store payers")
    })
  }
})

test.describe("Subscribers total, App Store stale and read 0 — still suspect (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: a stale 0 warns in amber with the icon, and the total leaves it out (1,284)`, async ({ page }) => {
      await mockStripe(page, liveSummary("connected", LIVE_METRICS, APP_STORE_ZERO_STALE))
      await open(page, "/home")
      await setTheme(page, theme)
      const card = kpi(page, "Subscribers")
      await expect(card).toContainText("1,284")
      await expect(card).not.toContainText("1,337")
      expect(await rowsOf(card)).toEqual([
        ["Stripe paying", "1,110"],
        ["App Store", "Check source"],
        ["Free (never paid)", "174"],
      ])
      const row = card.locator("[data-row='appStore']")
      await expect(row).toHaveAttribute("data-warning", "")
      await expect(row.getByRole("img", { name: "Warning: App Store count is suspect" })).toBeVisible()
      // Amber: the figure is painted in the theme's --warning-text, not the default foreground.
      const [value, amber] = await row.locator("dd").evaluate((dd) => {
        const probe = document.createElement("span")
        probe.style.color = "var(--warning-text)"
        dd.parentElement!.appendChild(probe)
        const want = getComputedStyle(probe).color
        probe.remove()
        return [getComputedStyle(dd).color, want]
      })
      expect(value).toBe(amber)
      // Suspect wins over stale: the RLS note, not "App Store as of …".
      await expect(card.getByTestId("subscriber-breakdown-note")).toHaveText(SUSPECT_NOTE)
      await expect(card).not.toContainText(/App Store\s*0\b/)
      await expectReadable(card.getByTestId("subscriber-breakdown"), `${theme} stale suspect breakdown`, expect)

      await expect(ticker(page).getByRole("link")).toHaveAccessibleName("Subscribers: 1,284, up 3 today")
    })
  }
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
