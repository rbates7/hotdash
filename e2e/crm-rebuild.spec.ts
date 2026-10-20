import { expect, test, type Page, type Route } from "@playwright/test"

import { gmailConnecting } from "../src/lib/crm/gmail-summary"
import {
  HOSTILE_TEXT,
  crmFixtureSummary,
  crmFixtureThreadBody,
  crmNotConnectedBody,
  crmSummaryFromGmail,
  FIXTURE_SUBJECTS,
} from "../src/test/crm-fixture"

import { LIVE_CASES, emptyLiveSummary, liveCase } from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"
import { setTheme } from "./support/theme"

/**
 * The rebuilt CRM screens (Overview, Cases with its panel, Accounts) against
 * a mocked /api/crm/gmail in Hill's contract (`src/lib/crm/types.ts`):
 * `CrmListResponse` for the list, `CrmThreadResponse` for `?caseId=`. e2e
 * never has Gmail credentials: "not connected" is the real server;
 * everything else is routed in the browser. Fixtures are invented people at
 * example.com / example.org (src/test/*-fixture.ts).
 *
 * The route matches the list and the panel's `?caseId=` thread read: a
 * glob like `**\/api/crm/gmail` would miss the query string.
 */

const GMAIL_API = /\/api\/crm\/gmail(\?.*)?$/
const EDITS_KEY = "hotdash.crm.case-edits.v1"

type Mock = { summary?: unknown; thread?: unknown; status?: number; threadStatus?: number }

/** Hill's shapes as they are, with no legacy fields (develop's store then reads not connected). */
async function mockCrm(page: Page, { summary, thread, status = 200, threadStatus = 200 }: Mock) {
  await page.route(GMAIL_API, async (route: Route) => {
    const url = new URL(route.request().url())
    if (status !== 200) {
      await route.fulfill({ status, json: { error: "Locked. Sign in at /unlock." } })
      return
    }
    if (url.searchParams.has("caseId")) {
      if (threadStatus !== 200) await route.fulfill({ status: threadStatus, json: { error: "not_found" } })
      else await route.fulfill({ json: thread, headers: { "Cache-Control": "no-store" } })
      return
    }
    await route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } })
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
const casePanel = (page: Page) => page.getByTestId("case-panel")

const LIVE = liveGmailSummary(Date.now())
const ROSTER = liveCase(LIVE, LIVE_CASES.roster)
const HILL = crmFixtureSummary(Date.now())

/** Names and subjects from the old sample: none of them may show. */
const OLD_SAMPLE = ["Marcus Hale", "Staff seats invite fails on the iPad", "Riley Nash", "Westfield HS"]

async function expectNoSample(page: Page) {
  for (const name of OLD_SAMPLE) await expect(main(page).getByText(name)).toHaveCount(0)
}

/** A count card shows no number (its label "… over 3 days" has a digit, so look at the value). */
async function expectNoNumber(card: ReturnType<Page["locator"]>) {
  await expect(card.locator(".tabular-nums")).toHaveCount(0)
  expect(((await card.textContent()) ?? "").trim()).not.toMatch(/^\d/)
}

test.describe("Gmail not connected (the real server)", () => {
  test("Overview counts say Not connected, never the route's zeros; every list is a Not connected panel", async ({ page }) => {
    await open(page, "/crm")
    const counts = main(page).getByTestId("crm-count")
    await expect(counts).toHaveCount(6)
    for (const count of await counts.all()) {
      await expect(count.getByTestId("not-connected")).toHaveText("Not connected")
      await expectNoNumber(count)
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

  test("Cases still says where edits are kept (Simmons), outside the ⋯ menu", async ({ page }) => {
    await open(page, "/crm/cases")
    await expect(main(page).getByTestId("crm-edits-note")).toHaveText("Edits save in this browser")
  })
})

test.describe("Gmail connecting (mocked first sync)", () => {
  for (const path of ["/crm", "/crm/cases", "/crm/accounts"]) {
    test(`${path}: skeletons and a busy Connecting…, never Not connected or 0`, async ({ page }) => {
      await mockCrm(page, { summary: { ...crmNotConnectedBody(), status: "connecting" } })
      await open(page, path)
      const badge = main(page).getByTestId("crm-connecting").first()
      await expect(badge).toBeVisible()
      await expect(badge).toHaveText("Connecting…")
      await expect(badge).toHaveAttribute("aria-busy", "true")
      await expect(main(page).getByTestId("crm-not-connected")).toHaveCount(0)
      await expect(liveRegion(page)).toContainText("Connecting")
      for (const count of await main(page).getByTestId("crm-count").all()) await expectNoNumber(count)
    })
  }

  test("develop's store and the rebuilt screens agree (the route's merged body)", async ({ page }) => {
    await mockGmail(page, gmailConnecting())
    await open(page, "/crm")
    await expect(main(page).getByTestId("crm-connecting").first()).toBeVisible()
  })
})

test.describe("Gmail connected (mocked, 1440: split view)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Overview, Cases and Accounts come from the inbox, with no sample rows", async ({ page }) => {
    await mockGmail(page, LIVE)
    await open(page, "/crm")
    await expect(main(page).getByRole("link", { name: /^\d+ Open$/ })).toBeVisible()
    await expect(main(page).getByRole("list", { name: "Recent activity" }).getByRole("link").first()).toContainText(
      / (wrote|replied) on #\d+ — /
    )
    await expectNoSample(page)

    await open(page, "/crm/cases")
    for (const subject of Object.values(LIVE_CASES)) await expect(caseRow(page, subject)).toBeVisible()
    await expect(main(page).getByTestId("crm-edits-note")).toHaveText("Edits save in this browser")
    await expect(casesTable(page).getByRole("columnheader")).toHaveText(["Unread", "#", "Subject", "Contact", "Status", "Priority", "Last activity", "Channel"])
    await expectNoSample(page)

    await open(page, "/crm/accounts")
    const accounts = main(page).getByRole("table", { name: "Accounts" })
    await expect(accounts.getByRole("row")).toHaveCount(crmSummaryFromGmail(LIVE, Date.now()).accounts.length + 1)
    await expect(accounts.getByRole("columnheader")).toHaveText(["Account", "Contacts", "Last activity", "Open"])
    await expect(accounts.getByRole("link")).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/crm\/accounts\/./)
  })

  test("Hill's shape alone renders the screens; a personal-domain contact shows — for the account", async ({ page }) => {
    await mockCrm(page, { summary: HILL })
    await open(page, "/crm/cases")
    for (const c of HILL.cases) await expect(caseRow(page, c.subject)).toBeVisible()
    await expect(caseRow(page, FIXTURE_SUBJECTS.closed).getByTestId("case-account")).toHaveText("—")
  })

  test("New (waiting on you) badges use info-text on a 12% / 18% info tint", async ({ page }) => {
    await mockCrm(page, { summary: HILL })
    await open(page, "/crm")
    // Dark is the app's default: switch to light first.
    await setTheme(page, "light")
    const badge = main(page).getByRole("list", { name: "Oldest waiting on you" }).getByTestId("crm-status-badge").first()
    await expect(badge).toHaveCSS("color", "rgb(0, 98, 184)")
    await setTheme(page, "dark")
    await expect(badge).toHaveCSS("color", "rgb(122, 186, 251)")
  })

  test("connected but empty: honest empty states, real zeros", async ({ page }) => {
    await mockGmail(page, emptyLiveSummary())
    await open(page, "/crm")
    await expect(main(page).getByText("No cases waiting on you")).toBeVisible()
    await expect(main(page).getByRole("link", { name: "0 Open" })).toBeVisible()
    await open(page, "/crm/cases")
    await expect(main(page).getByText(/^No cases yet\./)).toBeVisible()
  })

  test("stale: the rows plus Last updated", async ({ page }) => {
    await mockGmail(page, { ...LIVE, status: "stale" })
    await open(page, "/crm/cases")
    await expect(main(page).getByTestId("crm-stale")).toContainText("Last updated")
    await expect(caseRow(page, LIVE_CASES.roster)).toBeVisible()
  })

  test("filters live in the URL; no match offers Clear filters", async ({ page }) => {
    await mockGmail(page, LIVE)
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

  test("a status change in the row picker is kept in this browser across a reload", async ({ page }) => {
    await mockGmail(page, LIVE)
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

  test("the panel opens beside the list (~480px) with a plain-text thread: markup is literal text, never elements", async ({ page }) => {
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    await open(page, "/crm/cases")
    const link = caseRow(page, FIXTURE_SUBJECTS.urgent).getByRole("link")
    await link.click()
    await expect(page).toHaveURL(/[?&]case=case-1/)
    const panel = casePanel(page)
    await expect(panel).toHaveAttribute("data-mode", "split")
    const box = (await panel.boundingBox())!
    expect(Math.abs(box.width - 480)).toBeLessThanOrEqual(2)
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(FIXTURE_SUBJECTS.urgent)
    await expect(panel.getByTestId("case-panel-meta")).toHaveText("#1 · Test Person Alpha · example.com")
    await expect(panel.getByTestId("crm-edits-note")).toBeVisible()
    // The table drops to its "panel open" columns.
    await expect(casesTable(page).getByRole("columnheader", { name: "Priority" })).toHaveCount(0)

    const thread = panel.getByRole("list", { name: "Thread" })
    const first = thread.getByTestId("message-text").first()
    await expect(first).toContainText(HOSTILE_TEXT)
    await expect(thread.locator("script, b")).toHaveCount(0)
    await expect(panel.getByTestId("message-html")).toHaveCount(0)
    await expect(thread.getByTestId("message-text").nth(1)).toHaveCSS("white-space", "pre-wrap")
    expect(await page.evaluate(() => document.querySelectorAll("main [data-testid=case-panel] b").length)).toBe(0)

    await panel.getByRole("button", { name: "Close case" }).click()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await expect(casePanel(page)).toHaveCount(0)
    await expect(link).toBeFocused()
  })

  test("the status control is a keyboard radiogroup, and ↓ moves to the next case", async ({ page }) => {
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    await open(page, "/crm/cases?case=case-1")
    const group = casePanel(page).getByRole("radiogroup", { name: "Status" })
    await expect(group.getByRole("radio")).toHaveText(["Open", "Waiting on you", "Waiting on them", "Closed"])
    const checked = group.getByRole("radio", { checked: true })
    await expect(checked).toHaveText("Waiting on you")
    await checked.focus()
    await page.keyboard.press("ArrowRight")
    await expect(group.getByRole("radio", { checked: true })).toHaveText("Waiting on them")
    await expect(group.getByRole("radio", { name: "Waiting on them" })).toBeFocused()
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), EDITS_KEY)).toContain("waiting_on_them")

    await casePanel(page).getByRole("heading", { level: 2 }).click()
    await page.keyboard.press("ArrowDown")
    await expect(page).toHaveURL(/[?&]case=case-3/)
    await expect(casePanel(page).getByTestId("case-panel-position")).toHaveText("2 of 4")
  })

  test("the thread route's 404 shows Thread not found", async ({ page }) => {
    await mockCrm(page, { summary: HILL, threadStatus: 404 })
    await open(page, "/crm/cases?case=case-1")
    await expect(casePanel(page).getByText("Thread not found")).toBeVisible()
  })

  test("the old deep link opens the same case in the panel", async ({ page }) => {
    await mockGmail(page, LIVE)
    await open(page, `/crm/cases/${ROSTER.id}`)
    await expect(page).toHaveURL(new RegExp(`/crm/cases\\?case=${ROSTER.id}$`))
    await expect(casePanel(page).getByRole("heading", { level: 2 })).toHaveText(LIVE_CASES.roster)
  })
})

test.describe("case panel below 1440", () => {
  test("1180–1439: a 480px sheet with no scrim; the list stays clickable and swaps the case", async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 900 })
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    await open(page, "/crm/cases?case=case-1")
    const sheet = page.getByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    await expect(sheet).toHaveAttribute("data-mode", "overlay")
    expect(Math.round((await sheet.boundingBox())!.width)).toBeLessThanOrEqual(480)
    await expect(page.locator("[data-slot=sheet-overlay]")).toBeHidden()
    await caseRow(page, FIXTURE_SUBJECTS.waiting).getByRole("link").click()
    await expect(page).toHaveURL(/[?&]case=case-3/)
    await expect(page.getByRole("dialog", { name: FIXTURE_SUBJECTS.waiting })).toBeVisible()
  })

  test("820–1179: a sheet over a literal black scrim, 40% light / 60% dark", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    // Dark is the app's default. Pick the theme with no sheet open (the modal
    // sheet makes the toggle inert); next-themes keeps it across the goto.
    await open(page, "/crm/cases")
    for (const [theme, alpha] of [
      ["light", /0\.4\)|\/ 0\.4\)|40%/],
      ["dark", /0\.6\)|\/ 0\.6\)|60%/],
    ] as const) {
      await setTheme(page, theme)
      await open(page, "/crm/cases?case=case-1")
      const sheet = page.getByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
      await expect(sheet).toHaveAttribute("data-mode", "modal")
      const scrim = page.locator("[data-slot=sheet-overlay]")
      await expect(scrim).toBeVisible()
      const bg = await scrim.evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(bg, `${theme} scrim`).toMatch(alpha)
      await page.keyboard.press("Escape")
      await expect(page).toHaveURL(/\/crm\/cases$/)
    }
  })
})

test.describe("session expired (401 from the login gate)", () => {
  for (const path of ["/crm", "/crm/cases", "/crm/accounts"]) {
    test(`${path}: Your session expired, with a way back in — never Not connected`, async ({ page }) => {
      await mockCrm(page, { status: 401 })
      await open(page, path)
      const expired = main(page).getByTestId("crm-session-expired").first()
      await expect(expired).toContainText("Your session expired.")
      await expect(expired.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", /^\/unlock\?next=/)
      await expect(main(page).getByTestId("crm-not-connected")).toHaveCount(0)
      await expect(main(page).getByTestId("not-connected")).toHaveCount(0)
    })
  }
})

test.describe("phone (390)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const path of ["/crm", "/crm/cases", "/crm/accounts", "/crm/triage", "/crm/contacts"]) {
    test(`${path} never scrolls sideways`, async ({ page }) => {
      await mockGmail(page, LIVE)
      await open(page, path)
      // Triage and Contacts have no live region; wait for the rows to replace "Connecting…" instead.
      await expect(main(page)).not.toContainText("Connecting")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
    })
  }

  test("cases are a stacked two-line list, not a table; the panel is a bottom sheet with a 44px status control", async ({ page }) => {
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    await open(page, "/crm/cases")
    await expect(casesTable(page)).toBeHidden()
    const list = main(page).getByTestId("case-list")
    await expect(list).toBeVisible()
    const row = list.getByRole("link").filter({ hasText: FIXTURE_SUBJECTS.urgent })
    await expect(row).toContainText(`#1${FIXTURE_SUBJECTS.urgent}`)
    await expect(row.getByTestId("crm-status-badge")).toBeVisible()
    await expectTapTarget(row, "case row")
    await expect(main(page).getByTestId("crm-edits-note")).toBeVisible()
    await row.click()
    const sheet = page.getByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    await expect(sheet).toHaveAttribute("data-mode", "bottom")
    const box = (await sheet.boundingBox())!
    expect(box.y + box.height).toBeGreaterThanOrEqual(843)
    expect(box.height).toBeLessThan(844 * 0.6)
    for (const radio of await sheet.getByRole("radio").all()) await expectTapTarget(radio, "status segment")
    await expectTapTarget(sheet.getByRole("button", { name: "Close case" }), "close")
    await sheet.getByRole("button", { name: "Full height" }).click()
    await expect(sheet).toHaveAttribute("data-expanded", "true")
    expect((await sheet.boundingBox())!.height).toBeGreaterThan(844 * 0.9)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })

  test("filters live in a bottom sheet behind a Filters button with the active count; 44px controls; no sideways scroll", async ({ page }) => {
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    await open(page, "/crm/cases")
    const list = main(page).getByTestId("case-list")
    const before = await list.getByRole("link").count()
    expect(before).toBeGreaterThan(1)
    // The inline segment is hidden on a phone; only the trigger shows.
    await expect(main(page).getByRole("group", { name: "Status filter" })).toBeHidden()
    const trigger = main(page).getByTestId("crm-filters-trigger")
    await expect(trigger).toHaveAccessibleName("Filters")
    await expectTapTarget(trigger, "Filters")
    await trigger.click()
    const sheet = page.getByRole("dialog", { name: "Filters" })
    await expect(sheet).toBeVisible()
    for (const b of await sheet.getByRole("group", { name: "Status filter" }).getByRole("button").all())
      await expectTapTarget(b, "status filter")
    await expectTapTarget(sheet.getByRole("button", { name: "Needs my reply" }), "Needs my reply")
    await expectTapTarget(sheet.getByRole("combobox", { name: "Priority filter" }), "priority")
    await expectTapTarget(sheet.getByRole("button", { name: "Clear" }), "Clear")
    await expectTapTarget(sheet.getByRole("button", { name: "Done" }), "Done")
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await sheet.getByRole("group", { name: "Status filter" }).getByRole("button", { name: "Closed" }).click()
    await expect(page).toHaveURL(/status=closed/)
    await expect.poll(() => list.getByRole("link").count()).toBeLessThan(before)
    await sheet.getByRole("button", { name: "Done" }).click()
    await expect(sheet).toBeHidden()
    await expect(trigger).toHaveAccessibleName("Filters, 1 on")
    await expect(main(page).getByTestId("crm-filters-count")).toHaveText("1")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })

  test("the open case panel never scrolls the page sideways", async ({ page }) => {
    await mockCrm(page, { summary: HILL, thread: crmFixtureThreadBody(Date.now()) })
    await open(page, "/crm/cases")
    await main(page).getByTestId("case-list").getByRole("link").filter({ hasText: FIXTURE_SUBJECTS.urgent }).click()
    const sheet = page.getByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    await expect(sheet).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test("the tab bar shows a scroll cue at the right edge until the strip is scrolled to the end", async ({ page }) => {
    await mockGmail(page, LIVE)
    await open(page, "/crm")
    const bar = page.getByTestId("crm-tab-bar")
    await expect(bar).toHaveAttribute("data-fade-end", "")
    await expect(bar.getByTestId("crm-tab-fade-end")).toHaveCSS("opacity", "1")
    const nav = page.getByRole("navigation", { name: "CRM sections", exact: true })
    await nav.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    await expect(bar).not.toHaveAttribute("data-fade-end", "")
    await expect(bar).toHaveAttribute("data-fade-start", "")
  })

  test("the CRM tabs are exactly Overview · Cases · Accounts · Triage · Contacts, 44px, scrolling in their own strip", async ({ page }) => {
    await mockGmail(page, LIVE)
    await open(page, "/crm/accounts")
    const nav = page.getByRole("navigation", { name: "CRM sections", exact: true })
    await expect(nav.getByRole("link")).toHaveText([/^Overview/, /^Cases/, /^Accounts/, /^Triage/, /^Contacts/])
    const active = nav.getByRole("link", { name: "Accounts" })
    await expect(active).toHaveAttribute("aria-current", "page")
    await expect(active).toBeInViewport()
    for (const name of ["Overview", "Cases", "Accounts", "Triage", "Contacts"]) {
      const tab = nav.getByRole("link", { name: new RegExp(`^${name}`) })
      await tab.scrollIntoViewIfNeeded()
      await expectTapTarget(tab, `${name} tab`)
    }
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })
})
