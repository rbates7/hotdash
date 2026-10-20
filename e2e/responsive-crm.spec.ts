import { expect, test, type Locator, type Page } from "@playwright/test"

import type { LiveGmailSummary } from "../src/lib/crm/gmail-summary"

import { expectReadable, settleAnimations } from "./support/contrast"
import {
  CRM_LIVE_LEDE,
  EDITS_NOTE,
  FIND_CONTACT,
  LIVE_CASES,
  LIVE_PEOPLE,
  LIVE_TRIAGE,
  OWN_CONTACTS,
  OWN_ID_BASE,
  clearMenuItem,
  closeCrmMenu,
  crmHeader,
  crmMenuButton,
  crmSource,
  expectCrmSource,
  expectGmailPanel,
  gmailPanel,
  liveCase,
  liveContact,
  openCrmMenu,
  openWithOwnContacts,
  withPlans,
  type OwnContact,
} from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { NOTE, persistenceNote } from "./support/persistence"
import { expectFocusTrapped, expectNoOverflowX, pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * CRM at phone / tablet / desktop (Deke 8:2, 8:236, 8:665, 7:47, 7:83).
 * Phone stacks RowCollapse cards with a bottom sheet of row actions; tablet
 * keeps ≤5-column tables with one "…" per row; desktop (≥1280) is unchanged
 * apart from the pressed status filter. There is no sample: contacts and
 * the header ⋯ menu's Clear my entries are measured with the founder's own
 * contacts saved (Gmail not connected, the CI state); cases, the case panel
 * and triage with the fixture inbox from a mocked /api/crm/gmail. Cases and
 * Accounts by width (table from 820, a list below) and the case panel's four
 * modes are checked here at a glance; the rebuilt Cases screen's behaviour
 * in depth is covered by e2e/crm-rebuild.spec.ts.
 */

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const TOUCH_SIZES = [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const

const LIVE = liveGmailSummary(Date.now())
const ROSTER = liveCase(LIVE, LIVE_CASES.roster)
const DANA = liveContact(LIVE, LIVE_PEOPLE.dana.email)
const ROSTER_SUBJECT = LIVE_CASES.roster
const DANA_NAME = LIVE_PEOPLE.dana.name

/** The founder's own contacts (OWN_CONTACTS): sorted by name, Lee Morgan comes before Pat Reyes. */
const PAT = "Pat Reyes"
const LEE = "Lee Morgan"
const PAT_ID = `contact-${OWN_ID_BASE}`

/** Gmail not connected, the founder's own contacts saved. */
const NOT_CONNECTED_ROUTES = [
  "/crm",
  "/crm/cases",
  "/crm/accounts",
  "/crm/contacts",
  `/crm/contacts/${PAT_ID}`,
  "/crm/triage",
] as const
/** Gmail connected (mocked). */
const LIVE_ROUTES = [
  "/crm",
  "/crm/cases",
  // The old case page redirects here: the case panel (a sheet below 1440).
  `/crm/cases?case=${ROSTER.id}`,
  "/crm/accounts",
  "/crm/contacts",
  `/crm/contacts/${DANA.id}`,
  "/crm/triage",
] as const

const main = (page: Page) => page.getByRole("main")
const header = crmHeader
// Gmail's badge and Clear my entries are in the header's ⋯ menu (open it first).
const source = crmSource
const clearButton = clearMenuItem
const casePanel = (page: Page) => page.getByTestId("case-panel")
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const statusFilter = (page: Page) => main(page).getByRole("group", { name: "Status filter", exact: true })
const cardList = (page: Page) => main(page).locator("[data-slot='responsive-table']").getByRole("list")
const cards = (page: Page) => cardList(page).locator("[data-slot='row-collapse']")
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const card = (page: Page, title: string) =>
  cardList(page).getByRole("button", { name: new RegExp(`^${escapeRe(title)}`) })
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true })
const sheetActions = (page: Page, title: string, group: string) =>
  sheet(page, title).getByRole("group", { name: group, exact: true }).locator("a, button")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const table = (page: Page, name: string) => main(page).getByRole("table", { name, exact: true })

/**
 * Go to `path` keeping storage and routes, and wait for the source to answer
 * and the rows to load. Gmail's badge is in the header's ⋯ menu (opened and
 * closed again); with a case open (a modal sheet below 1180) the panel,
 * which shows only once the inbox has answered, stands in for it.
 */
async function visit(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
  if (path.includes("case=")) await expect(casePanel(page)).toBeVisible()
  else await expectCrmSource(page)
  await expect(main(page).getByRole("status", { name: /^Loading saved/ })).toHaveCount(0)
  await settleAnimations(page)
}

/** Gmail not connected, `contacts` saved as the founder's own: Clear my entries is enabled. */
async function own(page: Page, path = "/crm/contacts", contacts: readonly OwnContact[] = OWN_CONTACTS) {
  await openWithOwnContacts(page, path, contacts)
  await visit(page, path)
  await openCrmMenu(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
  await expect(source(page)).toHaveAttribute("data-source", "not_connected")
  await closeCrmMenu(page)
}

/** The fixture inbox (or `summary`) from a mocked /api/crm/gmail. A later call's route wins. */
async function live(page: Page, path = "/crm/cases", summary: LiveGmailSummary = liveGmailSummary(Date.now())) {
  await mockGmail(page, summary)
  await visit(page, path)
  await expect(header(page).getByText(CRM_LIVE_LEDE, { exact: true })).toBeVisible()
  if (!path.includes("case=")) await expectCrmSource(page, "Live from Gmail", "gmail")
}

/** Clear my entries in the open ⋯ menu is usable (the founder's contacts are saved). */
async function expectClearEnabled(page: Page) {
  await openCrmMenu(page)
  await expect(clearButton(page)).not.toHaveAttribute("aria-disabled", "true")
  await closeCrmMenu(page)
}

async function expectTapTarget(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(44)
}

const INTERACTIVE =
  "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='menuitemradio'], [role='option'], [role='combobox'], [role='checkbox'], [role='switch'], [role='tab'], [tabindex]:not([tabindex='-1'])"

/** Every painted control in `scope` under 44×44, as "tag "name" w×h". */
async function smallTargets(scope: Locator) {
  const measured = await scope.locator(INTERACTIVE).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const name =
        el.getAttribute("aria-label") ?? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48)
      // Base UI Select's form-value <input> is aria-hidden and visually hidden: not a target.
      const formValue = el.tagName === "INPUT" && el.getAttribute("aria-hidden") === "true"
      // A non-modal Base UI portal (the case panel at 1180–1439) leaves two
      // visually hidden 1×1 focus guards in place to keep tab order: not targets.
      const focusGuard = el.hasAttribute("data-base-ui-focus-guard")
      return {
        name: `${el.tagName.toLowerCase()} "${name}"`,
        width: r.width,
        height: r.height,
        painted: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !formValue && !focusGuard,
      }
    })
  )
  const painted = measured.filter((m) => m.painted)
  return {
    count: painted.length,
    small: painted
      .filter((m) => m.width < 44 || m.height < 44)
      .map((m) => `${m.name} ${m.width.toFixed(1)}×${m.height.toFixed(1)}`),
  }
}

/**
 * Every painted control in `scope` is at least 44×44. Lists every offender
 * so one run shows them all; a single 43px target fails (see the negative
 * control below).
 */
async function expectAllTargets44(scope: Locator, label: string) {
  const { count, small } = await smallTargets(scope)
  expect(count, `${label}: controls measured`).toBeGreaterThan(0)
  expect(small, `${label}: every control ≥ 44×44`).toEqual([])
}

/** Wait for open animations and colour transitions so boxes and colours are final. */
const settle = (locator: Locator) => settleAnimations(locator.page())

/** A dialog reached below 1280: every control, the ×, and it fits the screen. */
async function expectDialog44(d: Locator, label: string, { close = true } = {}) {
  await expect(d).toBeVisible()
  await settle(d)
  await expectAllTargets44(d, label)
  if (close) await expectTapTarget(d.getByRole("button", { name: "Close", exact: true }), `${label} ×`)
  await expect(d, `${label} fits the screen`).toBeInViewport({ ratio: 1 })
}

/* --------------------------------------------------------- every route */

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`responsive CRM routes (${name} ${viewport.width})`, () => {
    test.use({ viewport })

    test("no route scrolls sideways; below 1280 every control in main is ≥ 44×44", async ({ page }) => {
      // Gmail not connected with the founder's contacts saved: the panels,
      // their rows and an enabled Clear my entries (in the ⋯ menu).
      await own(page, "/crm")
      for (const route of NOT_CONNECTED_ROUTES) {
        await visit(page, route)
        await expectClearEnabled(page)
        expect(await pageOverflowX(page), `${route} page overflow`).toBeLessThanOrEqual(1)
        await expectNoOverflowX(page)
        if (viewport.width < 1280) await expectAllTargets44(main(page), `${viewport.width} ${route} (not connected)`)
      }
      // Gmail connected: the inbox's rows on every screen.
      await mockGmail(page, liveGmailSummary(Date.now()))
      for (const route of LIVE_ROUTES) {
        await visit(page, route)
        await expect(header(page).getByText(CRM_LIVE_LEDE, { exact: true })).toBeVisible()
        expect(await pageOverflowX(page), `${route} page overflow (live)`).toBeLessThanOrEqual(1)
        await expectNoOverflowX(page)
        if (viewport.width < 1280) await expectAllTargets44(main(page), `${viewport.width} ${route} (live)`)
      }
    })
  })
}

test.describe("44px sweep (negative control)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("a single 43px target fails the sweep", async ({ page }) => {
    await live(page)
    expect((await smallTargets(main(page))).small).toEqual([])
    await statusFilter(page)
      .getByRole("button", { name: "Open", exact: true })
      .evaluate((el) => el.setAttribute("style", "min-height: 0 !important; height: 43px !important"))
    const { small } = await smallTargets(main(page))
    expect(small).toHaveLength(1)
    expect(small[0]).toMatch(/^button "Open" \d+\.\d×43\.0$/)
  })
})

/* ------------------------------------------------------------------ phone */

test.describe("responsive CRM (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("header: title and ⋯ on one row, the full-width Find a contact… below; badge, note and Clear in the ⋯ menu", async ({
    page,
  }) => {
    await own(page)
    const menuButton = crmMenuButton(page)
    await expectTapTarget(menuButton, "CRM menu")
    const mBox = (await menuButton.boundingBox())!
    expect(Math.round(mBox.width)).toBe(44)
    expect(Math.round(mBox.height)).toBe(44)
    const title = (await header(page).getByRole("heading", { level: 1, name: "CRM" }).boundingBox())!
    const lede = (await header(page).locator("p").first().boundingBox())!
    expect(mBox.y, "⋯ sits on the title line").toBeLessThan(title.y + title.height)
    expect(mBox.x, "⋯ is right of the title").toBeGreaterThan(lede.x + lede.width - 1)
    // The phone's own finder: full width under the lede; the ⌘K one is desktop-only.
    const find = header(page).getByRole("button", { name: FIND_CONTACT, exact: true })
    await expectTapTarget(find, "Find a contact…")
    const fBox = (await find.boundingBox())!
    const hBox = (await header(page).boundingBox())!
    expect(fBox.y, "Find a contact… under the lede").toBeGreaterThan(lede.y + lede.height)
    expect(fBox.width, "Find a contact… is full width").toBeGreaterThanOrEqual(hBox.width - 1)
    await expect(header(page).getByText("⌘K")).toBeHidden()
    // Nothing else in the header row: Gmail's state and storage are in the menu.
    await expect(header(page).getByTestId("crm-source")).toHaveCount(0)
    await expect(header(page).getByTestId("persistence-note")).toHaveCount(0)
    const menu = await openCrmMenu(page)
    await settle(menu)
    await expect(source(page)).toHaveAttribute("data-source", "not_connected")
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(clearButton(page)).not.toHaveAttribute("aria-disabled", "true")
    await expectTapTarget(clearButton(page), "Clear my entries")
    await expect(menu, "the menu fits the screen").toBeInViewport({ ratio: 1 })
    await closeCrmMenu(page)
    // Find a contact… opens the palette.
    await find.click()
    await expect(dialog(page, "Search CRM")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog(page, "Search CRM")).toBeHidden()
    for (const tab of await crmNav(page).getByRole("link").all()) await expectTapTarget(tab, "section tab")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("Cases: a stacked list of link rows (no pickers); a case opens in a bottom sheet that grows to full height", async ({
    page,
  }) => {
    await live(page)
    const list = main(page).getByTestId("case-list")
    await expect(list).toBeVisible()
    await expect(table(page, "Cases")).toBeHidden()
    await expect(list).toHaveAccessibleName("Cases")
    await expect(list.getByRole("listitem").first()).toBeVisible()
    const rows = await list.getByRole("listitem").count()
    // Status changes happen in the panel: no pickers in the rows.
    await expect(list.getByRole("combobox")).toHaveCount(0)
    await expect(list.getByRole("radiogroup")).toHaveCount(0)
    await expect(main(page).getByTestId("crm-cases-count")).toHaveText(`${rows} cases`)
    await expect(main(page).getByTestId("crm-edits-note")).toHaveText(EDITS_NOTE)
    const row = list.getByRole("link", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) })
    await expect(row).toContainText(`#${ROSTER.id.replace("case-", "")}`)
    await expect(row).toContainText(DANA_NAME)
    await expectTapTarget(row, "case row")

    await row.click()
    await expect(page).toHaveURL(new RegExp(`[?&]case=${ROSTER.id}$`))
    const panel = casePanel(page)
    await expect(panel).toHaveAttribute("data-mode", "bottom")
    await expect(panel).toHaveAttribute("data-side", "bottom")
    await expect(page.getByRole("dialog", { name: ROSTER_SUBJECT, exact: true })).toBeVisible()
    await settle(panel)
    const vh = VIEWPORTS.phone.height
    expect(Math.abs((await panel.boundingBox())!.height - vh * 0.55), "55% tall").toBeLessThanOrEqual(2)
    // No ↑ / ↓ or position in the bottom sheet; Full height and × are 44.
    await expect(panel.getByTestId("case-panel-position")).toHaveCount(0)
    await expectTapTarget(panel.getByRole("button", { name: "Close case", exact: true }), "Close case")
    const full = panel.getByRole("button", { name: "Full height", exact: true })
    await expectTapTarget(full, "Full height")
    await full.click()
    await expect
      .poll(async () => Math.abs((await panel.boundingBox())!.height - vh * 0.95), { message: "95% tall" })
      .toBeLessThanOrEqual(2)
    await expect(panel.getByRole("button", { name: "Shrink", exact: true })).toBeVisible()
    await expect(panel.getByRole("radiogroup", { name: "Status" }).getByRole("radio")).toHaveCount(4)

    await panel.getByRole("button", { name: "Close case", exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await expect(row).toBeFocused()
  })

  test("Accounts: a list (name, open count) instead of the table; rows are not links", async ({ page }) => {
    await live(page, "/crm/accounts")
    const list = main(page).getByTestId("account-list")
    await expect(list).toBeVisible()
    await expect(table(page, "Accounts")).toBeHidden()
    await expect(list.getByRole("listitem").first()).toBeVisible()
    await expect(list.getByRole("link")).toHaveCount(0)
    await expect(main(page).getByTestId("account-cards")).toHaveCount(0)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  // Old Cases phone UI (full-width segmented tabs, filter strip, RowCollapse case cards) removed by the CRM rebuild; the filters are covered by e2e/crm-rebuild.spec.ts.

  test("Contacts: the panel, then cards with Name, Email, 'Organization · N open cases'", async ({ page }) => {
    await own(page)
    await expectGmailPanel(page, "contacts")
    await expect(cards(page)).toHaveCount(OWN_CONTACTS.length)
    await expect(table(page, "Contacts")).toBeHidden()
    const panelBox = (await gmailPanel(page).boundingBox())!
    expect((await cards(page).first().boundingBox())!.y, "cards under the panel").toBeGreaterThan(panelBox.y + panelBox.height)
    const pat = card(page, PAT)
    await expect(pat).toContainText("pat.reyes@example.org")
    await expect(pat).toContainText("Katy ISD · 0 open cases")
    await expect(card(page, LEE)).toContainText("No organization · 0 open cases")
    await expectTapTarget(main(page).getByRole("button", { name: "New contact", exact: true }), "New contact")
    await expect(main(page).getByRole("textbox", { name: "Search contacts" })).toHaveCSS("height", "44px")

    // No plan pill on the cards, even with plans in the data (no Gmail source).
    await live(page, "/crm/contacts", withPlans(liveGmailSummary(Date.now())))
    await expect(card(page, DANA_NAME).getByTestId("card-plan-pill")).toHaveCount(0)
    await expect(card(page, DANA_NAME)).toContainText(/example\.org · 2 open cases/)
  })

  // Old Cases row sheet (Open case / Delete case, focus after delete) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

  test("the Contacts sheet: Open, Edit (existing form) and Delete (existing confirm); focus returns", async ({ page }) => {
    await own(page)
    await card(page, PAT).click()
    const s = sheet(page, PAT)
    await expect(s).toBeVisible()
    await expect(s).toContainText("pat.reyes@example.org")
    await expect(s).toContainText("Katy ISD · 0 open cases")
    await expect(sheetActions(page, PAT, "Contact actions")).toHaveText(["Open contact", "Edit contact", "Delete contact"])
    await settle(s)
    await expectAllTargets44(s, "390 contact sheet")
    await expectFocusTrapped(page, s)

    await sheetActions(page, PAT, "Contact actions").filter({ hasText: "Edit contact" }).click()
    const edit = dialog(page, "Edit contact")
    await expect(edit).toBeVisible()
    await expect(s).toBeHidden()
    await expect(edit.getByLabel("First name")).toHaveValue("Pat")
    await expect(edit.getByLabel("Organization")).toHaveValue("Katy ISD")
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
    await expect(card(page, PAT)).toBeFocused()

    // Delete Lee (the first card): focus moves to Pat, now in Lee's place.
    await expect(cards(page)).toHaveCount(2)
    const titles = await cards(page).evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    const i = titles.findIndex((t) => t.startsWith(LEE))
    expect(i, "Lee is listed").toBeGreaterThanOrEqual(0)
    await card(page, LEE).click()
    await sheetActions(page, LEE, "Contact actions").filter({ hasText: "Delete contact" }).click()
    await dialog(page, "Delete this contact?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(card(page, LEE)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(1)
    await expect(cards(page).nth(i)).toBeFocused()

    await card(page, PAT).click()
    await sheetActions(page, PAT, "Contact actions").filter({ hasText: "Open contact" }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/${PAT_ID}$`))
    await expect(main(page).getByRole("heading", { level: 2, name: PAT })).toBeVisible()
  })

  test("contact detail: its Cases table stacks as cards that open the case", async ({ page }) => {
    await live(page, `/crm/contacts/${DANA.id}`)
    await expect(table(page, `Cases for ${DANA_NAME}`)).toBeHidden()
    await expect(cards(page)).toHaveCount(2)
    await card(page, ROSTER_SUBJECT).click()
    // The old case route redirects to the Cases panel (a sheet at 390).
    await expect(page).toHaveURL(new RegExp(`/crm/cases\\?case=${ROSTER.id}$`))
    await expect(page.getByTestId("case-panel")).toContainText(ROSTER_SUBJECT)
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive CRM (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    // Old Cases tablet table ("…" row menus, Delete case, segmented toolbar) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

    test("Cases: the table's columns at this width; the case panel is a sheet (modal with a scrim at 820, not at 1180)", async ({
      page,
    }) => {
      const portrait = name === "tablet-portrait"
      await live(page)
      // Dark is the app's default; the scrim below is checked at its light 40%.
      await setTheme(page, "light")
      const t = table(page, "Cases")
      await expect(main(page).getByTestId("case-list")).toBeHidden()
      // Priority from 1180; Channel only from 1440.
      await expect(t.getByRole("columnheader")).toHaveText(
        portrait
          ? ["Unread", "#", "Subject", "Contact", "Status", "Last activity"]
          : ["Unread", "#", "Subject", "Contact", "Status", "Priority", "Last activity"]
      )
      await expect(main(page).getByTestId("crm-edits-note")).toHaveText(EDITS_NOTE)
      const link = t.getByRole("link", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) })
      await link.click()
      await expect(page).toHaveURL(new RegExp(`[?&]case=${ROSTER.id}$`))
      const panel = casePanel(page)
      await expect(panel).toHaveAttribute("data-mode", portrait ? "modal" : "overlay")
      await expect(panel).toHaveAttribute("data-side", "right")
      await expect(page.getByRole("dialog", { name: ROSTER_SUBJECT, exact: true })).toBeVisible()
      await settle(panel)
      await expect(panel.getByTestId("case-panel-position")).toHaveText(/^\d+ of \d+$/)
      // ↑ / ↓ are links, or disabled buttons at either end of the list.
      for (const control of ["Previous case", "Next case", "Close case"]) {
        const target = panel
          .getByRole("button", { name: control, exact: true })
          .or(panel.getByRole("link", { name: control, exact: true }))
        await expectTapTarget(target, control)
      }
      // The status radiogroup: four 44-tall segments, one checked.
      const radios = panel.getByRole("radiogroup", { name: "Status" }).getByRole("radio")
      await expect(radios).toHaveText(["Open", "Waiting on you", "Waiting on them", "Closed"])
      await expect(panel.getByRole("radio", { checked: true })).toHaveCount(1)
      for (const radio of await radios.all()) await expectTapTarget(radio, "status segment")
      await expect(panel.getByTestId("crm-edits-note")).toHaveText(EDITS_NOTE)
      await expect(panel.getByTestId("message-text").first()).toBeVisible()
      await expect(panel.getByTestId("message-html")).toHaveCount(0)

      const scrim = page.locator("[data-slot='sheet-overlay']")
      if (portrait) {
        // 820–1179: a modal sheet over the literal black scrim; Escape closes it.
        await expect(scrim).toBeVisible()
        // Black at 40% (Tailwind's color-mix may serialise as rgba() or oklab()).
        await expect(scrim).toHaveCSS("background-color", /^(rgba\(0, 0, 0, 0\.4\)|oklab\(0 0 0 \/ 0\.4\)|color\(srgb 0 0 0 \/ 0\.4\))$/)
        await page.keyboard.press("Escape")
      } else {
        // 1180–1439: no scrim, not modal; another row swaps the case, × closes it.
        await expect(scrim).toBeHidden()
        const other = t.getByRole("link", { name: new RegExp(escapeRe(LIVE_CASES.invoice)) })
        await other.click()
        await expect(page.getByRole("dialog", { name: LIVE_CASES.invoice, exact: true })).toBeVisible()
        await panel.getByRole("button", { name: "Close case", exact: true }).click()
      }
      await expect(panel).toBeHidden()
      await expect(page).toHaveURL(/\/crm\/cases$/)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("Accounts: Account, Contacts, Open (Last activity from 1180); rows are not links", async ({ page }) => {
      await live(page, "/crm/accounts")
      const t = table(page, "Accounts")
      await expect(main(page).getByTestId("account-list")).toBeHidden()
      await expect(t.getByRole("columnheader")).toHaveText(
        name === "tablet-portrait" ? ["Account", "Contacts", "Open"] : ["Account", "Contacts", "Last activity", "Open"]
      )
      await expect(t.getByRole("row").nth(1)).toBeVisible()
      await expect(t.getByRole("link")).toHaveCount(0)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("Contacts: the panel above; Email folds under Name; one 44×44 '…' with Open / Edit / Delete", async ({ page }) => {
      await own(page)
      await expectGmailPanel(page, "contacts")
      await expect(cardList(page)).toBeHidden()
      const t = table(page, "Contacts")
      await expect(t.getByRole("columnheader")).toHaveText(["Name", "Organization", "Open cases", "Actions"])
      const row = t.getByRole("row", { name: new RegExp(PAT) })
      await expect(row.getByRole("cell").first().getByText("pat.reyes@example.org")).toBeVisible()
      await expect(row.getByRole("cell")).toHaveCount(4)
      const more = row.getByRole("button", { name: `More actions for ${PAT}` })
      await expectTapTarget(more, "contact …")
      await more.click()
      const menu = page.getByRole("menu")
      await expect(menu.getByRole("menuitem")).toHaveText(["Open contact", "Edit contact", "Delete contact"])
      await settle(menu)
      await expectAllTargets44(menu, `${VIEWPORTS[name].width} contact menu`)
      await menu.getByRole("menuitem", { name: "Edit contact" }).click()
      const edit = dialog(page, "Edit contact")
      await expect(edit.getByLabel("First name")).toHaveValue("Pat")
      await page.keyboard.press("Escape")
      await expect(edit).toBeHidden()
      await expect(more).toBeFocused()
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })
  })
}

/* ------------------------------------------- dialogs, menus, palette (B1) */

for (const [size, viewport] of TOUCH_SIZES) {
  test.describe(`CRM dialogs and menus are touch-sized (${size})`, () => {
    test.use({ viewport })

    test("fields, options, footer buttons, ×, menu rows, palette rows ≥ 44; dialogs fit the screen", async ({ page }) => {
      const phone = size === "390"
      await own(page)

      // The header's ⋯ button and menu (Connect…, Clear my entries): 44 rows, on screen.
      await expectTapTarget(crmMenuButton(page), `${size} CRM menu`)
      const crmMenu = await openCrmMenu(page)
      await settle(crmMenu)
      await expectAllTargets44(crmMenu, `${size} CRM menu`)
      await expect(crmMenu, `${size} CRM menu fits the screen`).toBeInViewport({ ratio: 1 })
      await closeCrmMenu(page)

      // New contact.
      await main(page).getByRole("button", { name: "New contact", exact: true }).click()
      const add = dialog(page, "New contact")
      await expectDialog44(add, `${size} new contact`)
      if (phone) {
        const first = (await add.getByLabel("First name").boundingBox())!
        const last = (await add.getByLabel("Last name").boundingBox())!
        expect(last.y, "Last name stacks under First name").toBeGreaterThan(first.y + first.height)
      }
      await page.keyboard.press("Escape")
      await expect(add).toBeHidden()

      // Edit / Delete contact, opened the way this width opens them.
      for (const [action, title] of [
        ["Edit contact", "Edit contact"],
        ["Delete contact", "Delete this contact?"],
      ] as const) {
        if (phone) {
          await card(page, PAT).click()
          await sheetActions(page, PAT, "Contact actions").filter({ hasText: action }).click()
        } else {
          await table(page, "Contacts").getByRole("button", { name: `More actions for ${PAT}` }).click()
          await page.getByRole("menu").getByRole("menuitem", { name: action }).click()
        }
        const d = dialog(page, title)
        await expectDialog44(d, `${size} ${action}`)
        if (phone && action === "Edit contact") {
          const first = (await d.getByLabel("First name").boundingBox())!
          const last = (await d.getByLabel("Last name").boundingBox())!
          expect(last.y).toBeGreaterThan(first.y + first.height)
        }
        await page.keyboard.press("Escape")
        await expect(d).toBeHidden()
      }

      // Cases (live): priority filter options, then a row's priority picker options.
      await live(page)
      await main(page).getByRole("combobox", { name: "Priority filter" }).click()
      const options = page.getByRole("listbox")
      await expect(options).toBeVisible()
      await settle(options)
      await expectAllTargets44(options, `${size} priority filter options`)
      await page.keyboard.press("Escape")
      await expect(options).toBeHidden()
      // The case's priority picker, in the case panel at every width (the
      // list rows below 820 have no pickers; the table's Priority column is
      // 1180 up), and the panel's 44px status segments.
      await main(page).getByRole("link", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) }).click()
      const panel = casePanel(page)
      await expect(panel).toBeVisible()
      await settle(panel)
      const radios = panel.getByRole("radiogroup", { name: "Status" }).getByRole("radio")
      await expect(radios).toHaveCount(4)
      for (const radio of await radios.all()) await expectTapTarget(radio, `${size} status segment`)
      await panel.getByRole("combobox", { name: `Priority: ${ROSTER_SUBJECT}`, exact: true }).click()
      await expect(options).toBeVisible()
      await settle(options)
      await expectAllTargets44(options, `${size} case priority options`)
      await page.keyboard.press("Escape")
      await expect(options).toBeHidden()
      // The picker's Escape closes its list first; × closes the panel.
      if (await panel.isVisible()) await panel.getByRole("button", { name: "Close case", exact: true }).click()
      await expect(panel).toBeHidden()
      // Old Cases "Delete case" (row sheet / "…" and case detail) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

      // Command palette (from Find a contact…), with results.
      await header(page).getByRole("button", { name: new RegExp(`^${FIND_CONTACT}`) }).click()
      const palette = dialog(page, "Search CRM")
      await palette.getByLabel("Search cases and contacts").fill("a")
      await expect(palette.getByRole("button").first()).toBeVisible()
      await expectDialog44(palette, `${size} command palette`, { close: false })
      await page.keyboard.press("Escape")
      await expect(palette).toBeHidden()

      // Triage: the More menu and "Link to an existing contact".
      await visit(page, "/crm/triage")
      const sam = page.locator("[data-slot=triage-card]", { hasText: LIVE_TRIAGE.sam })
      await sam.getByRole("button", { name: "More actions" }).click()
      const menu = page.getByRole("menu")
      await expect(menu).toBeVisible()
      await settle(menu)
      await expectAllTargets44(menu, `${size} triage menu`)
      await page.keyboard.press("Escape")
      await expect(menu).toBeHidden()
      await sam.getByRole("button", { name: "Link contact", exact: true }).click()
      await expectDialog44(dialog(page, "Link to an existing contact"), `${size} link contact`)
      await page.keyboard.press("Escape")
      await expectNoOverflowX(page)
    })
  })
}

/* ------------------------------------------------------------- textarea */

// Old case detail UI (the note composer) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

/* ---------------------------------------------------------------- desktop */

test.describe("responsive CRM (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: original columns, no cards, no '…', develop's control sizes", async ({ page }) => {
    // Not connected, own contacts saved: the header's ⋯ (and its Clear) and the Contacts table.
    await own(page)
    // ≥1280 keeps develop's compact sizes: the ⋯ button and its rows are not grown to 44.
    expect((await crmMenuButton(page).boundingBox())!.height).toBeLessThan(44)
    await openCrmMenu(page)
    await settle(clearButton(page))
    expect((await clearButton(page).boundingBox())!.height).toBeLessThan(44)
    await closeCrmMenu(page)
    await expect(table(page, "Contacts").getByRole("columnheader")).toHaveText([
      "Name",
      "Email",
      "Organization",
      "Open cases",
    ])
    await expect(main(page).getByRole("button", { name: /^More actions for / })).toHaveCount(0)
    await expect(cardList(page)).toBeHidden()
    // The shared header and tabs: the ⌘K finder (the phone's full-width one is hidden) and compact tabs.
    const find = header(page).getByRole("button", { name: new RegExp(`^${FIND_CONTACT}`) })
    await expect(find).toHaveCount(1)
    await expect(find).toContainText("⌘K")
    expect((await find.boundingBox())!.height).toBeLessThan(44)
    expect((await crmNav(page).getByRole("link", { name: "Cases", exact: true }).boundingBox())!.height).toBeLessThan(44)
    // The segmented tabs: the current one is the raised pill.
    const current = crmNav(page).getByRole("link", { name: "Contacts", exact: true })
    await expect(current).toHaveAttribute("aria-current", "page")
    await expect(current).toHaveClass(/\bbg-surface\b/)
    await expect(current).toHaveClass(/\bshadow-sm\b/)
    // Old desktop Cases toolbar and case detail sizes removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("Cases: every column; the panel sits beside the list (~480px) and the list drops Priority, Last activity, Channel", async ({
    page,
  }) => {
    await live(page)
    const t = table(page, "Cases")
    await expect(main(page).getByTestId("case-list")).toBeHidden()
    await expect(t.getByRole("columnheader")).toHaveText([
      "Unread",
      "#",
      "Subject",
      "Contact",
      "Status",
      "Priority",
      "Last activity",
      "Channel",
    ])
    await t.getByRole("link", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]case=${ROSTER.id}$`))
    const panel = casePanel(page)
    await expect(panel).toHaveAttribute("data-mode", "split")
    // Beside the list in <main>, not a dialog.
    await expect(main(page).getByRole("complementary", { name: ROSTER_SUBJECT, exact: true })).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(Math.abs((await panel.boundingBox())!.width - 480), "~480px wide").toBeLessThanOrEqual(2)
    await expect(t.getByRole("columnheader")).toHaveText(["Unread", "#", "Subject", "Contact", "Status"])
    await expect(panel.getByTestId("case-panel-position")).toHaveText(/^\d+ of \d+$/)
    await expect(panel.getByRole("radiogroup", { name: "Status" }).getByRole("radio")).toHaveCount(4)
    await expect(panel.getByTestId("crm-edits-note")).toHaveText(EDITS_NOTE)
    await panel.getByRole("button", { name: "Close case", exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(t.getByRole("columnheader")).toHaveCount(8)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("Accounts: Account, Contacts, Last activity, Open; the domain shows only when it differs from the name", async ({
    page,
  }) => {
    await live(page, "/crm/accounts")
    const t = table(page, "Accounts")
    await expect(main(page).getByTestId("account-list")).toBeHidden()
    await expect(t.getByRole("columnheader")).toHaveText(["Account", "Contacts", "Last activity", "Open"])
    await expect(t.getByRole("link")).toHaveCount(0)
    // Gmail knows only the domain, so the name is the domain and is not repeated under it.
    for (const cell of await t.locator("tbody tr td:first-child").all()) {
      const lines = await cell.locator("span span").allTextContents()
      expect(lines.length === 1 || lines[0] !== lines[1], `domain not repeated: ${lines.join(" / ")}`).toBe(true)
    }
  })
})

/* ------------------------------------------------------ filter contrast */

// Old Cases status filter (segmented links with aria-current) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

/* --------------------------------------------------------------- readable */

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of TOUCH_SIZES) {
    test.describe(`readable CRM (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`new and restyled controls clear 4.5:1 in ${theme}`, async ({ page }) => {
        const phone = size === "390"
        const label = `${theme}/${size}`

        // Gmail not connected, own contacts saved: the header, its ⋯ menu
        // (Clear enabled, so no longer exempt as an inactive control), the
        // panel, the rows.
        await own(page)
        await setTheme(page, theme)
        await expectReadable(header(page).getByRole("heading", { level: 1 }), `${label}/title`, expect)
        await expectReadable(header(page).locator("p").first(), `${label}/lede`, expect)
        await expectReadable(
          header(page).getByRole("button", { name: new RegExp(`^${FIND_CONTACT}`) }),
          `${label}/Find a contact…`,
          expect
        )
        await expectReadable(crmNav(page), `${label}/section tabs`, expect)
        await expectTapTarget(crmMenuButton(page), `${label}/CRM menu`)
        await openCrmMenu(page)
        await settle(clearButton(page))
        await expectReadable(persistenceNote(page), `${label}/note`, expect)
        await expectReadable(source(page), `${label}/not connected badge`, expect)
        await expect(clearButton(page)).not.toHaveAttribute("aria-disabled", "true")
        await expectTapTarget(clearButton(page), `${label}/Clear my entries`)
        await expectReadable(clearButton(page), `${label}/enabled Clear my entries`, expect)
        await closeCrmMenu(page)
        await expectReadable(gmailPanel(page), `${label}/contacts panel`, expect)

        // Contacts: cards / table, the Edit form, New contact's inline error.
        if (phone) {
          await expectReadable(cardList(page), `${label}/contact cards`, expect)
          await card(page, PAT).click()
          const s = sheet(page, PAT)
          await expect(s).toBeVisible()
          await settle(s)
          await expectReadable(s, `${label}/contact sheet`, expect)
          await sheetActions(page, PAT, "Contact actions").filter({ hasText: "Edit contact" }).click()
        } else {
          await expectReadable(table(page, "Contacts"), `${label}/contacts table`, expect)
          await table(page, "Contacts").getByRole("button", { name: `More actions for ${PAT}` }).click()
          const menu = page.getByRole("menu")
          await settle(menu)
          await expectReadable(menu, `${label}/contact menu`, expect)
          await menu.getByRole("menuitem", { name: "Edit contact" }).click()
        }
        const edit = dialog(page, "Edit contact")
        await expect(edit).toBeVisible()
        await settle(edit)
        await expectReadable(edit, `${label}/edit contact`, expect)
        await page.keyboard.press("Escape")
        await expect(edit).toBeHidden()
        await main(page).getByRole("button", { name: "New contact", exact: true }).click()
        const add = dialog(page, "New contact")
        await add.getByLabel("Email").fill(OWN_CONTACTS[0]!.email)
        await add.getByRole("button", { name: "Create contact", exact: true }).click()
        await expect(add.getByRole("alert")).toBeVisible()
        await settle(add)
        await expectReadable(add, `${label}/new contact with error`, expect)
        await page.keyboard.press("Escape")
        await expect(add).toBeHidden()

        // Old Cases toolbar, cards / table, row sheet or "…" and Delete case confirm removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

        // Triage (live): the touch-sized More menu (Always ignore is destructive text).
        await live(page, "/crm/triage")
        await page.locator("[data-slot=triage-card]", { hasText: LIVE_TRIAGE.sam }).getByRole("button", { name: "More actions" }).click()
        const triageMenu = page.getByRole("menu")
        await settle(triageMenu)
        await expectReadable(triageMenu, `${label}/triage menu`, expect)
        await page.keyboard.press("Escape")
        await expect(triageMenu).toBeHidden()

        // Old case detail render-failure error state removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      })
    })
  }
}

/* ------------------------------------- round 2, B1: tablet tables fit */

const LONG_EMAIL = "christopher.montgomery.head-coach@example.org" // 45
const LONG_NAME = { firstName: "Christopher Alexander", lastName: "Montgomery-Whitfield" } // 42
const LONG_NAME_TEXT = `${LONG_NAME.firstName} ${LONG_NAME.lastName}`
const LONG_EMAIL_NO_ORG = "maximilian.featherstonehaugh.bartholomew.fbc@example.org" // 56
const LONG_NAME_NO_ORG = { firstName: "Maximilian Bartholomew", lastName: "Featherstonehaugh" } // 40
const NAMELESS_EMAIL = "administrator.office.manager.bartholomew.fbc@example.org" // 56

/**
 * The inbox with long names and emails: Dana (two cases, with an org) and
 * Ben (one case, no org, so his email is the Contact cell's second line)
 * are renamed; one more contact has no name, so the email is the Name.
 */
function longNamesInbox(): LiveGmailSummary {
  const inbox = liveGmailSummary(Date.now())
  const ben = liveContact(inbox, LIVE_PEOPLE.ben.email)
  const contacts = inbox.data.contacts.map((c) => {
    if (c.email === LIVE_PEOPLE.dana.email) return { ...c, ...LONG_NAME, email: LONG_EMAIL }
    if (c.email === LIVE_PEOPLE.ben.email) return { ...c, ...LONG_NAME_NO_ORG, email: LONG_EMAIL_NO_ORG, organizationId: null }
    return c
  })
  contacts.push({ ...ben, id: "contact-50", firstName: null, lastName: null, nameSource: null, email: NAMELESS_EMAIL, organizationId: null })
  expect(LONG_EMAIL.length).toBeGreaterThanOrEqual(45)
  expect(LONG_NAME_TEXT.length).toBeGreaterThanOrEqual(30)
  return { ...inbox, data: { ...inbox.data, contacts } }
}

/**
 * The table fits its container (no sideways scroll), every row's "…" is the
 * element actually under its centre, and no cell or anything in it is
 * clipped or bleeding (scrollWidth > clientWidth + 1).
 */
async function expectTableFits(page: Page, name: string, label: string) {
  const t = table(page, name)
  await settle(t)
  const result = await t.evaluate((tableEl) => {
    const containers = [tableEl.parentElement, tableEl.closest("[data-slot='responsive-table']")]
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => ({ slot: el.getAttribute("data-slot") ?? el.tagName, scroll: el.scrollWidth, client: el.clientWidth }))
    const clipped: string[] = []
    tableEl.querySelectorAll("tbody td").forEach((td, cellIndex) => {
      for (const el of [td, ...Array.from(td.querySelectorAll("*"))]) {
        if (!(el instanceof HTMLElement)) continue
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden" || el.clientWidth === 0) continue
        if (el.scrollWidth > el.clientWidth + 1) {
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
          clipped.push(`cell ${cellIndex} <${el.tagName.toLowerCase()}> "${text}" ${el.scrollWidth}>${el.clientWidth}`)
        }
      }
    })
    return { containers, clipped }
  })
  for (const c of result.containers) {
    expect(c.scroll, `${label}: ${c.slot} scrolls sideways (${c.scroll} > ${c.client})`).toBeLessThanOrEqual(c.client + 1)
  }
  expect(result.clipped, `${label}: clipped cell content`).toEqual([])

  const menus = t.getByRole("button", { name: /^More actions for / })
  const rows = await t.locator("tbody tr").count()
  await expect(menus).toHaveCount(rows)
  for (const menu of await menus.all()) {
    await menu.scrollIntoViewIfNeeded()
    const hit = await menu.evaluate((button) => {
      const r = button.getBoundingClientRect()
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { ok: at === button || (at !== null && button.contains(at)), at: at?.outerHTML.slice(0, 80) ?? "nothing" }
    })
    expect(hit.ok, `${label}: ${await menu.getAttribute("aria-label")} is under its own centre (hit ${hit.at})`).toBe(true)
  }
  expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
}

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  const size = VIEWPORTS[name].width
  test.describe(`CRM tablet tables fit long names and emails (${size})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("Contacts: a 45-character email and a 42-character name wrap; every '…' is reachable", async ({ page }) => {
      await live(page, "/crm/contacts", longNamesInbox())
      const t = table(page, "Contacts")
      await expect(t).toBeVisible()
      const row = t.getByRole("row", { name: new RegExp(escapeRe(LONG_NAME_TEXT)) })
      await expect(row.getByText(LONG_NAME_TEXT, { exact: true })).toBeVisible()
      // Folded under the Name at tablet (its own column is desktop-only).
      await expect(row.locator("span", { hasText: LONG_EMAIL })).toBeVisible()
      const nameless = t.getByRole("row", { name: new RegExp(escapeRe(NAMELESS_EMAIL)) })
      await expect(nameless).toBeVisible()
      // An email-as-name wraps beside its avatar, not on a line of its own under it.
      for (const [who, initials, text] of [[nameless, "AD", NAMELESS_EMAIL], [row, "CM", LONG_NAME_TEXT]] as const) {
        const link = who.getByRole("cell").first().getByRole("link")
        const avatar = (await link.getByText(initials, { exact: true }).boundingBox())!
        const nameTop = (await link.getByText(text, { exact: true }).boundingBox())!.y
        expect(nameTop, `${size} ${initials}: name starts on the avatar's line`).toBeLessThan(avatar.y + avatar.height)
      }
      await expect(t.locator("span", { hasText: LONG_EMAIL_NO_ORG })).toBeVisible()
      await expectTableFits(page, "Contacts", `${size} Contacts`)
    })

    // Old Cases tablet table (one "…" per row) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.
  })
}

/* ------------------------- round 2, B2: breadcrumb back keeps your place */

const RETURN_KEY = "hotdash.crm.from-list"

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)
const historyLength = (page: Page) => page.evaluate(() => window.history.length)
const recorded = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), RETURN_KEY)
// Contacts only: the old case detail page (and its "Cases /" breadcrumb) is gone.
const contactCrumb = (page: Page) =>
  main(page).locator("p", { hasText: /^Contacts \// }).getByRole("link", { name: "Contacts", exact: true })

/** Sixteen Westfield contacts of the founder's own, so `?q=westfield` scrolls on a phone. */
const WESTFIELD: OwnContact[] = [
  "Avery", "Blake", "Casey", "Devon", "Emerson", "Finley", "Gray", "Harper",
  "Indigo", "Jordan", "Kai", "Logan", "Morgan", "Noel", "Parker", "Quinn",
].map((firstName) => ({
  email: `${firstName.toLowerCase()}@example.org`,
  firstName,
  lastName: "Westfield",
  organization: "Westfield FB",
}))

/** Scroll the list to the bottom (until scrollY holds still) and return where the last card sits. */
async function scrollToBottom(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  let last = -1
  await expect
    .poll(
      async () => {
        const y = await scrollY(page)
        const still = y === last && y > 0
        last = y
        return still
      },
      { intervals: [100] }
    )
    .toBe(true)
  const y = await scrollY(page)
  const top = (await cards(page).last().boundingBox())!.y
  return { y, top }
}

async function expectPlaceBack(page: Page, before: { y: number; top: number }, label: string) {
  await expect.poll(async () => Math.abs((await scrollY(page)) - before.y), `${label}: scrollY back to ${before.y}`).toBeLessThanOrEqual(2)
  const top = (await cards(page).last().boundingBox())!.y
  expect(Math.abs(top - before.top), `${label}: last card top ${top} vs ${before.top}`).toBeLessThanOrEqual(2)
}

test.describe("CRM phone: the breadcrumb takes you back to your place in the list (390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  // Old case detail breadcrumb back to a filtered Cases list removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

  test("Contacts: from ?q=westfield at the bottom, 'Contacts' restores scroll, search and history", async ({ page }) => {
    const LIST = "/crm/contacts?q=westfield"
    await own(page, LIST, WESTFIELD)
    await expect(cards(page)).toHaveCount(WESTFIELD.length)
    const count = await cards(page).count()
    const before = await scrollToBottom(page)
    expect(before.y, "the searched list scrolls").toBeGreaterThan(300)
    const h0 = await historyLength(page)

    await cards(page).last().click()
    const open = page.getByRole("dialog").getByRole("group", { name: "Contact actions" }).getByRole("link", { name: "Open contact" })
    await open.click()
    await expect(page).toHaveURL(/\/crm\/contacts\/contact-/)
    await expect(contactCrumb(page)).toBeVisible()
    expect(await historyLength(page)).toBe(h0 + 1)

    await contactCrumb(page).click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === LIST)
    await expect(cards(page)).toHaveCount(count)
    await expectPlaceBack(page, before, "Contacts")
    await expect(main(page).getByRole("textbox", { name: "Search contacts" })).toHaveValue("westfield")
    expect(await historyLength(page), "Back, not a new entry").toBe(h0 + 1)
    expect(await recorded(page)).toBeNull()
  })

  test("deep links (and stale records) keep the plain link to the unfiltered list", async ({ page }) => {
    // Old Cases half (case detail breadcrumb) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

    // Contacts: straight to a contact by URL.
    await live(page, `/crm/contacts/${DANA.id}`)
    let h = await historyLength(page)
    await contactCrumb(page).click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/contacts")
    await expect(main(page).getByRole("textbox", { name: "Search contacts" })).toHaveValue("")
    expect(await historyLength(page)).toBe(h + 1)

    // Leaving a record for another page forgets its way back.
    await visit(page, "/crm/contacts?q=ortiz")
    await cards(page).first().click()
    await page.getByRole("dialog").getByRole("group", { name: "Contact actions" }).getByRole("link", { name: "Open contact" }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/${DANA.id}$`))
    await crmNav(page).getByRole("link", { name: "Triage" }).click()
    await expect(page).toHaveURL(/\/crm\/triage$/)
    await expect.poll(() => recorded(page)).toBeNull()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/${DANA.id}$`))
    h = await historyLength(page)
    await contactCrumb(page).click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/contacts")
    expect(await historyLength(page)).toBeLessThanOrEqual(h)
  })
})

test.describe("CRM desktop: the breadcrumb keeps the list's filters (1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("Contacts round-trips by history from a searched list", async ({ page }) => {
    // Old Cases half (case detail breadcrumb, deep link) removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.
    await live(page, "/crm/contacts?q=ortiz")
    const h1 = await historyLength(page)
    await table(page, "Contacts").getByRole("link", { name: new RegExp(DANA_NAME) }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/${DANA.id}$`))
    await contactCrumb(page).click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/contacts?q=ortiz")
    await expect(main(page).getByRole("textbox", { name: "Search contacts" })).toHaveValue("ortiz")
    expect(await historyLength(page)).toBe(h1 + 1)
  })
})
