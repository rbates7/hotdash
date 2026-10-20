import { expect, test, type Page, type Route } from "@playwright/test"

import { gmailConnecting } from "../src/lib/crm/gmail-summary"
import { HOSTILE_BODY, crmFixtureSummary, crmFixtureThread } from "../src/test/crm-fixture"

import { LIVE_CASES, emptyLiveSummary, liveCase } from "./support/crm"
import { liveGmailSummary } from "./support/gmail"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"

/**
 * The rebuilt CRM screens (Overview, Cases with its panel, Accounts) against
 * a mocked /api/crm/gmail. e2e never has Gmail credentials: "not connected"
 * is the real server; everything else is routed in the browser. Fixtures
 * are invented people at example.com / example.org (src/test/*-fixture.ts).
 *
 * The route matches the summary and the panel's `?caseId=` thread read: a
 * glob like `**\/api/crm/gmail` would miss the query string.
 */

const GMAIL_API = /\/api\/crm\/gmail(\?.*)?$/
const EDITS_KEY = "hotdash.crm.case-edits.v1"

type Mock = { summary?: unknown; thread?: unknown; status?: number }

async function mockCrm(page: Page, { summary, thread, status = 200 }: Mock) {
  await page.route(GMAIL_API, async (route: Route) => {
    const url = new URL(route.request().url())
    if (status !== 200) {
      await route.fulfill({ status, json: { error: "Locked. Sign in at /unlock." } })
      return
    }
    const body = url.searchParams.has("caseId") && thread !== undefined ? thread : summary
    await route.fulfill({ json: body, headers: { "Cache-Control": "no-store" } })
  })
}

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

const main = (page: Page) => page.getByRole("main")
const liveRegion = (page: Page) => main(page).getByTestId("crm-live-region")
const casesTable = (page: Page) => main(page).getByRole("table", { name: "Cases" })
const caseRow = (page: Page, subject: string) => casesTable(page).getByRole("row", { name: new RegExp(subject) })

const LIVE = liveGmailSummary(Date.now())
const ROSTER = liveCase(LIVE, LIVE_CASES.roster)

/** Names and subjects from the old sample: none of them may show. */
const OLD_SAMPLE = ["Marcus Hale", "Staff seats invite fails on the iPad", "Riley Nash", "Westfield HS"]

async function expectNoSample(page: Page) {
  for (const name of OLD_SAMPLE) await expect(main(page).getByText(name)).toHaveCount(0)
}

test.describe("Gmail not connected (the real server)", () => {
  test("Overview counts say Not connected, never 0; every list is a Not connected panel", async ({ page }) => {
    await open(page, "/crm")
    const counts = main(page).getByTestId("crm-count")
    await expect(counts).toHaveCount(4)
    for (const count of await counts.all()) {
      await expect(count.getByTestId("not-connected")).toHaveText("Not connected")
      await expect(count).not.toContainText(/\d/)
    }
    await expect(main(page).getByTestId("crm-not-connected")).toHaveCount(2)
    await expect(liveRegion(page)).toHaveText("Gmail is not connected.")
    await expectNoSample(page)
  })

  for (const path of ["/crm/cases", "/crm/accounts"]) {
    test(`${path} shows its Not connected panel and no table`, async ({ page }) => {
      await open(page, path)
      await expect(main(page).getByTestId("crm-not-connected")).toHaveCount(1)
      await expect(main(page).getByTestId("crm-not-connected").getByTestId("not-connected")).toHaveText("Not connected")
      await expect(main(page).getByRole("table")).toHaveCount(0)
      await expectNoSample(page)
    })
  }
})

test.describe("Gmail connecting (mocked first sync)", () => {
  for (const path of ["/crm", "/crm/cases", "/crm/accounts"]) {
    test(`${path}: skeletons and a busy Connecting…, never Not connected`, async ({ page }) => {
      await mockCrm(page, { summary: gmailConnecting() })
      await open(page, path)
      const badge = main(page).getByTestId("crm-connecting").first()
      await expect(badge).toBeVisible()
      await expect(badge).toHaveText("Connecting…")
      await expect(badge).toHaveAttribute("aria-busy", "true")
      await expect(main(page).getByTestId("crm-not-connected")).toHaveCount(0)
      await expect(liveRegion(page)).toContainText("Connecting")
    })
  }
})

test.describe("Gmail connected (mocked, 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Overview, Cases and Accounts come from the inbox, with no sample rows", async ({ page }) => {
    await mockCrm(page, { summary: LIVE })
    await open(page, "/crm")
    await expect(main(page).getByRole("link", { name: /^\d+ Open$/ })).toBeVisible()
    await expect(main(page).getByRole("list", { name: "Recent activity" })).toBeVisible()
    await expectNoSample(page)

    await open(page, "/crm/cases")
    for (const subject of Object.values(LIVE_CASES)) await expect(caseRow(page, subject)).toBeVisible()
    await expect(main(page).getByTestId("crm-edits-note")).toHaveText("Edits save in this browser")
    await expectNoSample(page)

    await open(page, "/crm/accounts")
    const accounts = main(page).getByRole("table", { name: "Accounts" })
    await expect(accounts.getByRole("row")).toHaveCount(LIVE.data.organizations.length + 1)
    await expect(accounts.getByRole("link")).toHaveCount(0)
  })

  test("connected but empty: honest empty states", async ({ page }) => {
    await mockCrm(page, { summary: emptyLiveSummary() })
    await open(page, "/crm")
    await expect(main(page).getByText("No cases waiting on you")).toBeVisible()
    await expect(main(page).getByRole("link", { name: "0 Open" })).toBeVisible()
    await open(page, "/crm/cases")
    await expect(main(page).getByText(/^No cases yet/)).toBeVisible()
  })

  test("stale: the rows plus Last updated", async ({ page }) => {
    await mockCrm(page, { summary: { ...LIVE, status: "stale" } })
    await open(page, "/crm/cases")
    await expect(main(page).getByTestId("crm-stale")).toContainText("Last updated")
    await expect(caseRow(page, LIVE_CASES.roster)).toBeVisible()
  })

  test("filters live in the URL; no match offers Clear filters", async ({ page }) => {
    await mockCrm(page, { summary: LIVE })
    await open(page, "/crm/cases")
    await main(page).getByRole("button", { name: "Needs my reply" }).click()
    await expect(page).toHaveURL(/[?&]waiting=1/)
    await expect(main(page).getByRole("button", { name: "Needs my reply" })).toHaveAttribute("aria-pressed", "true")

    await main(page).getByRole("group", { name: "Status filter" }).getByRole("button", { name: "Closed" }).click()
    await expect(page).toHaveURL(/[?&]status=closed/)
    await main(page).getByRole("searchbox", { name: "Search cases" }).fill("zz-no-such-case")
    await expect(page).toHaveURL(/[?&]q=zz-no-such-case/)
    await expect(main(page).getByText("No cases match", { exact: true }).first()).toBeVisible()
    await main(page).getByRole("button", { name: "Clear filters" }).click()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await expect(caseRow(page, LIVE_CASES.roster)).toBeVisible()

    // A filtered list is a link: it survives a reload.
    await open(page, "/crm/cases?status=closed")
    await expect(caseRow(page, LIVE_CASES.refund)).toBeVisible()
    await expect(casesTable(page).getByRole("row")).toHaveCount(2)
  })

  test("a status change is kept in this browser across a reload", async ({ page }) => {
    await mockCrm(page, { summary: LIVE })
    await open(page, "/crm/cases")
    const picker = caseRow(page, LIVE_CASES.roster).getByRole("combobox", { name: /^Status/ })
    await picker.click()
    await page.getByRole("option", { name: "Closed", exact: true }).click()
    await expect(picker).toHaveText(/Closed/)
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), EDITS_KEY)).toContain(ROSTER.id)

    await page.reload()
    await waitForHydration(page)
    await expect(caseRow(page, LIVE_CASES.roster).getByRole("combobox", { name: /^Status/ })).toHaveText(/Closed/)
  })

  test("the panel opens beside the list with a sanitized thread; a script never runs or lands", async ({ page }) => {
    await mockCrm(page, { summary: LIVE, thread: { messages: crmFixtureThread(Date.now()) } })
    await open(page, "/crm/cases")
    const link = caseRow(page, LIVE_CASES.roster).getByRole("link")
    await link.click()
    await expect(page).toHaveURL(new RegExp(`[?&]case=${ROSTER.id}`))
    const panel = main(page).getByTestId("case-panel")
    await expect(panel).toBeVisible()
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(LIVE_CASES.roster)
    await expect(panel.getByTestId("crm-edits-note")).toBeVisible()
    const html = panel.getByTestId("message-html")
    await expect(html).toContainText("Hello from the test inbox")
    await expect(html.locator("script")).toHaveCount(0)
    await expect(html.locator("[onerror]")).toHaveCount(0)
    await expect(html.getByText("bad link")).not.toHaveAttribute("href", /./)
    await expect(html.getByRole("link", { name: "safe link" })).toHaveAttribute("rel", "noopener noreferrer")
    expect(await page.evaluate(() => (window as unknown as { __crmPwned?: boolean }).__crmPwned)).toBeUndefined()
    expect(HOSTILE_BODY).toContain("<script>")

    await panel.getByRole("button", { name: "Close case" }).click()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await expect(main(page).getByTestId("case-panel")).toHaveCount(0)
    await expect(link).toBeFocused()
  })

  test("the old deep link opens the same case in the panel", async ({ page }) => {
    await mockCrm(page, { summary: LIVE })
    await open(page, `/crm/cases/${ROSTER.id}`)
    await expect(page).toHaveURL(new RegExp(`/crm/cases\\?case=${ROSTER.id}$`))
    await expect(main(page).getByTestId("case-panel").getByRole("heading", { level: 2 })).toHaveText(LIVE_CASES.roster)
  })

  test("Hill's typed shape renders the same screens", async ({ page }) => {
    const summary = crmFixtureSummary(Date.now())
    await mockCrm(page, { summary })
    await open(page, "/crm/cases")
    for (const c of summary.cases) await expect(caseRow(page, c.subject)).toBeVisible()
  })
})

test.describe("session expired (401 from the login gate)", () => {
  for (const path of ["/crm", "/crm/cases", "/crm/accounts"]) {
    test(`${path}: Your session expired, with a way back in — never Not connected`, async ({ page }) => {
      await mockCrm(page, { status: 401 })
      await open(page, path)
      const expired = main(page).getByTestId("crm-session-expired").first()
      await expect(expired).toContainText("Your session expired.")
      await expect(expired.getByRole("link", { name: "Log in again" })).toHaveAttribute("href", /^\/unlock\?next=/)
      await expect(main(page).getByTestId("crm-not-connected")).toHaveCount(0)
      await expect(main(page).getByTestId("not-connected")).toHaveCount(0)
    })
  }
})

test.describe("phone (390)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const path of ["/crm", "/crm/cases", "/crm/accounts"]) {
    test(`${path} never scrolls sideways`, async ({ page }) => {
      await mockCrm(page, { summary: LIVE })
      await open(page, path)
      await expect(liveRegion(page)).not.toContainText("Connecting")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
    })
  }

  test("cases stack as cards with 44px pickers; the panel opens as a sheet", async ({ page }) => {
    await mockCrm(page, { summary: LIVE })
    await open(page, "/crm/cases")
    await expect(casesTable(page)).toBeHidden()
    const cards = main(page).getByRole("list", { name: "Cases" })
    const card = cards.getByRole("listitem").filter({ hasText: LIVE_CASES.roster })
    await expectTapTarget(card.getByRole("combobox", { name: /^Status/ }), "status picker")
    await expectTapTarget(card.getByRole("combobox", { name: /^Priority/ }), "priority picker")
    await expectTapTarget(main(page).getByRole("button", { name: "Needs my reply" }), "Needs my reply")
    await card.getByRole("link").click()
    const sheet = page.getByRole("dialog", { name: LIVE_CASES.roster })
    await expect(sheet).toBeVisible()
    await expectTapTarget(sheet.getByRole("button", { name: "Close case" }), "close")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })

  test("the CRM tabs are 44px and scroll inside their own strip", async ({ page }) => {
    await mockCrm(page, { summary: LIVE })
    await open(page, "/crm/accounts")
    const nav = page.getByRole("navigation", { name: "CRM sections", exact: true })
    const active = nav.getByRole("link", { name: "Accounts" })
    await expect(active).toHaveAttribute("aria-current", "page")
    await expect(active).toBeInViewport()
    for (const name of ["Overview", "Cases", "Accounts", "Contacts", "Triage"]) {
      const tab = nav.getByRole("link", { name: new RegExp(`^${name}`) })
      await tab.scrollIntoViewIfNeeded()
      await expectTapTarget(tab, `${name} tab`)
    }
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })
})
