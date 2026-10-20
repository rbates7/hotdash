import { expect, test, type Locator, type Page } from "@playwright/test"

import type { LiveGmailSummary } from "../src/lib/crm/gmail-summary"

import { expectReadable, settleAnimations } from "./support/contrast"
import {
  LIVE_CASES,
  LIVE_PEOPLE,
  LIVE_TRIAGE,
  OWN_CONTACTS,
  OWN_ID_BASE,
  expectGmailPanel,
  gmailPanel,
  keepCases,
  liveCase,
  liveContact,
  openWithOwnContacts,
  withPlans,
  type OwnContact,
} from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { NOTE, persistenceNote } from "./support/persistence"
import {
  expectFocusTrapped,
  expectNoOverflowX,
  expectScrollLock,
  pageOverflowX,
  sheetOverlay,
  waitForHydration,
} from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * CRM at phone / tablet / desktop (Deke 8:2, 8:236, 8:665, 7:47, 7:83).
 * Phone stacks RowCollapse cards with a bottom sheet of row actions; tablet
 * keeps ≤5-column tables with one "…" per row; desktop (≥1280) is unchanged
 * apart from the pressed status filter. There is no sample: contacts and
 * the header's Clear my entries are measured with the founder's own
 * contacts saved (Gmail not connected, the CI state); cases, case detail
 * and triage with the fixture inbox from a mocked /api/crm/gmail.
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
const INVOICE = liveCase(LIVE, LIVE_CASES.invoice)
const DANA = liveContact(LIVE, LIVE_PEOPLE.dana.email)
const ROSTER_SUBJECT = LIVE_CASES.roster
const ROSTER_MENU = `More actions for #${ROSTER.caseNumber} ${ROSTER_SUBJECT}`
const DANA_NAME = LIVE_PEOPLE.dana.name

/** The founder's own contacts (OWN_CONTACTS): sorted by name, Lee Morgan comes before Pat Reyes. */
const PAT = "Pat Reyes"
const LEE = "Lee Morgan"
const PAT_ID = `contact-${OWN_ID_BASE}`

/** Gmail not connected, the founder's own contacts saved. */
const NOT_CONNECTED_ROUTES = ["/crm", "/crm/cases", "/crm/contacts", `/crm/contacts/${PAT_ID}`, "/crm/triage"] as const
/** Gmail connected (mocked). */
const LIVE_ROUTES = [
  "/crm",
  "/crm/cases",
  `/crm/cases/${ROSTER.id}`,
  "/crm/contacts",
  `/crm/contacts/${DANA.id}`,
  "/crm/triage",
] as const

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const source = (page: Page) => header(page).getByTestId("crm-source")
const clearButton = (page: Page) => header(page).getByRole("button", { name: "Clear my entries", exact: true })
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const statusFilter = (page: Page) => page.getByRole("navigation", { name: "Case status filter", exact: true })
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
const listHeading = (page: Page, name: string) => main(page).getByRole("heading", { level: 2, name, exact: true })

/** Go to `path` keeping storage and routes, and wait for the source to answer and the rows to load. */
async function visit(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
  await expect(source(page)).toBeVisible()
  await expect(main(page).getByRole("status", { name: /^Loading saved/ })).toHaveCount(0)
  await settleAnimations(page)
}

/** Gmail not connected, `contacts` saved as the founder's own: Clear my entries is enabled. */
async function own(page: Page, path = "/crm/contacts", contacts: readonly OwnContact[] = OWN_CONTACTS) {
  await openWithOwnContacts(page, path, contacts)
  await visit(page, path)
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
  await expect(source(page)).toHaveAttribute("data-source", "not_connected")
}

/** The fixture inbox (or `summary`) from a mocked /api/crm/gmail. A later call's route wins. */
async function live(page: Page, path = "/crm/cases", summary: LiveGmailSummary = liveGmailSummary(Date.now())) {
  await mockGmail(page, summary)
  await visit(page, path)
  await expect(source(page)).toHaveText("Live from Gmail")
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
      return {
        name: `${el.tagName.toLowerCase()} "${name}"`,
        width: r.width,
        height: r.height,
        painted: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !formValue,
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

/** Background contrast between two controls, each composited over its painted ancestors. */
async function backgroundContrast(a: Locator, b: Locator) {
  return a.evaluate((elA, elB) => {
    // Any CSS colour (rgb, lab, oklch…) to sRGB through a 1×1 canvas.
    const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", {
      willReadFrequently: true,
    })!
    const parse = (c: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "rgba(0, 0, 0, 0)"
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const over = (top: ReturnType<typeof parse>, under: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const v = c / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const painted = (el: Element) => {
      const layers: ReturnType<typeof parse>[] = []
      let node: Element | null = el
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor)
        if (bg.a > 0) layers.push(bg)
        if (bg.a >= 1) break
        node = node.parentElement
      }
      let backdrop = { r: 255, g: 255, b: 255 }
      for (const layer of layers.reverse()) backdrop = over(layer, backdrop)
      return backdrop
    }
    const [l1, l2] = [lum(painted(elA)), lum(painted(elB as Element))].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }, await b.elementHandle())
}

/**
 * Make a case's detail page (`path`) throw while rendering (its "Opened …"
 * Central date-time), so the CRM error state shows. Init script: applies to
 * every later navigation on this page.
 */
async function breakCaseDetail(page: Page, path: string) {
  await page.addInitScript((broken) => {
    const proto = Intl.DateTimeFormat.prototype
    const format = Object.getOwnPropertyDescriptor(proto, "format")!
    Object.defineProperty(proto, "format", {
      ...format,
      get(this: Intl.DateTimeFormat) {
        const o = this.resolvedOptions()
        if (location.pathname === broken && o.timeZone === "America/Chicago" && o.year && o.minute) {
          throw new Error("e2e: CRM render failure")
        }
        return format.get!.call(this)
      },
    })
  }, path)
}

/* --------------------------------------------------------- every route */

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`responsive CRM routes (${name} ${viewport.width})`, () => {
    test.use({ viewport })

    test("no route scrolls sideways; below 1280 every control in main is ≥ 44×44", async ({ page }) => {
      // Gmail not connected with the founder's contacts saved: the panels,
      // their rows and an enabled Clear my entries.
      await own(page, "/crm")
      for (const route of NOT_CONNECTED_ROUTES) {
        await visit(page, route)
        await expect(clearButton(page)).toBeEnabled()
        expect(await pageOverflowX(page), `${route} page overflow`).toBeLessThanOrEqual(1)
        await expectNoOverflowX(page)
        if (viewport.width < 1280) await expectAllTargets44(main(page), `${viewport.width} ${route} (not connected)`)
      }
      // Gmail connected: the inbox's rows on every screen.
      await mockGmail(page, liveGmailSummary(Date.now()))
      for (const route of LIVE_ROUTES) {
        await visit(page, route)
        await expect(source(page)).toHaveText("Live from Gmail")
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
      .getByRole("link", { name: "Open", exact: true })
      .evaluate((el) => el.setAttribute("style", "min-height: 0 !important; height: 43px !important"))
    const { small } = await smallTargets(main(page))
    expect(small).toHaveLength(1)
    expect(small[0]).toMatch(/^a "Open" \d+\.\d×43\.0$/)
  })
})

/* ------------------------------------------------------------------ phone */

test.describe("responsive CRM (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("header per Deke 8:2: Search top-right; the note, Clear my entries and badge on their own line", async ({ page }) => {
    await own(page)
    const search = header(page).getByRole("button", { name: "Search", exact: true })
    await expectTapTarget(search, "Search")
    const sBox = (await search.boundingBox())!
    expect(Math.round(sBox.width)).toBe(44)
    const title = (await header(page).getByRole("heading", { level: 1, name: "CRM" }).boundingBox())!
    const lede = (await header(page).locator("p").first().boundingBox())!
    const note = (await persistenceNote(page).boundingBox())!
    expect(sBox.y, "Search sits on the title line").toBeLessThan(title.y + title.height)
    expect(sBox.x, "Search is right of the title").toBeGreaterThan(lede.x + lede.width - 1)
    expect(note.y, "note under the lede").toBeGreaterThan(lede.y + lede.height)
    await expectTapTarget(clearButton(page), "Clear my entries")
    expect((await clearButton(page).boundingBox())!.y, "Clear under the lede").toBeGreaterThan(lede.y + lede.height)
    await expect(source(page)).toBeVisible()
    expect((await source(page).boundingBox())!.y, "badge under the lede").toBeGreaterThan(lede.y + lede.height)
    for (const tab of await crmNav(page).getByRole("link").all()) await expectTapTarget(tab, "section tab")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("Cases (live): tabs, search and filter strip per Deke 8:2; cards instead of the table", async ({ page }) => {
    // Ben without an organization, so his card shows his email instead.
    const inbox = liveGmailSummary(Date.now())
    const noOrgBen: LiveGmailSummary = {
      ...inbox,
      data: {
        ...inbox.data,
        contacts: inbox.data.contacts.map((c) => (c.email === LIVE_PEOPLE.ben.email ? { ...c, organizationId: null } : c)),
      },
    }
    await live(page, "/crm/cases", noOrgBen)
    // Header: the read-only note sits under the lede, where the saved-edits note would.
    const lede = (await header(page).locator("p").first().boundingBox())!
    expect((await header(page).getByTestId("crm-read-only").boundingBox())!.y).toBeGreaterThan(lede.y + lede.height)

    // Section tabs: one full-width row of equal 44px segments.
    const navBox = (await crmNav(page).boundingBox())!
    const mainBox = (await listHeading(page, "Cases").locator("..").boundingBox())!
    expect(Math.abs(navBox.width - mainBox.width)).toBeLessThanOrEqual(1)
    for (const tab of await crmNav(page).getByRole("link").all()) await expectTapTarget(tab, "section tab")

    // Full-width 44px search above one strip holding status + priority, which scrolls, not the page.
    const input = main(page).getByRole("textbox", { name: "Search cases" })
    await expect(input).toHaveCSS("height", "44px")
    expect(Math.abs((await input.boundingBox())!.width - mainBox.width)).toBeLessThanOrEqual(1)
    const strip = main(page).locator("[data-slot='cases-filter-strip']")
    expect((await strip.boundingBox())!.y).toBeGreaterThan((await input.boundingBox())!.y)
    await expect(strip.getByRole("combobox", { name: "Priority filter" })).toHaveCount(1)
    expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth), "strip scrolls sideways").toBe(true)
    await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    // Cards (Deke 7:47): Subject, Status, "#N · Contact · Org", "Priority priority · last activity".
    await expect(cards(page)).toHaveCount(LIVE.data.cases.length)
    await expect(table(page, "Cases")).toBeHidden()
    const roster = card(page, ROSTER_SUBJECT)
    await expect(roster.getByTestId("status-pill")).toHaveText("Open")
    await expect(roster).toContainText(`#${ROSTER.caseNumber} · ${DANA_NAME} · example.org`)
    await expect(roster).toContainText(/High priority · \d+[mhd] ago/)
    await expect(cardList(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(card(page, LIVE_CASES.refund)).toContainText(`${LIVE_PEOPLE.ben.name} · ${LIVE_PEOPLE.ben.email}`)
    expect((await roster.boundingBox())!.height).toBeGreaterThanOrEqual(64)
  })

  test("Contacts: the panel, then cards with Name, Plan, Email, 'Organization · N open cases'", async ({ page }) => {
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

    // A plan, when there is one, shows as the card's pill (live, with plans).
    await live(page, "/crm/contacts", withPlans(liveGmailSummary(Date.now())))
    await expect(card(page, DANA_NAME).getByTestId("card-plan-pill")).toHaveText("Annual")
    await expect(card(page, DANA_NAME)).toContainText(/example\.org · 2 open cases/)
  })

  test("the Cases sheet: summary, 48px actions, ×/backdrop/Escape close, focus trapped and returned, scroll locked", async ({ page }) => {
    await live(page)
    await card(page, ROSTER_SUBJECT).click()
    const s = sheet(page, ROSTER_SUBJECT)
    await expect(s).toBeVisible()
    await expect(s).toHaveAttribute("data-side", "bottom")
    await expect(s.getByTestId("status-pill")).toHaveText("Open")
    await expect(s).toContainText(`#${ROSTER.caseNumber} · ${DANA_NAME} · example.org`)
    await expect(s).toContainText(/High priority · /)
    const actions = sheetActions(page, ROSTER_SUBJECT, "Case actions")
    await expect(actions).toHaveText(["Open case", "Delete case"])
    for (const action of await actions.all()) expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await settle(s)
    await expectAllTargets44(s, "390 case sheet")
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, s)

    // The stock ×, a 44×44 hit clear of the title.
    const close = s.getByRole("button", { name: "Close", exact: true })
    const box = (await close.boundingBox())!
    expect(Math.round(box.width)).toBe(44)
    expect(Math.round(box.height)).toBe(44)
    const titleBox = (await s.getByRole("heading", { name: ROSTER_SUBJECT }).boundingBox())!
    expect(titleBox.x + titleBox.width, "title clear of the ×").toBeLessThanOrEqual(box.x)
    await close.click()
    await expect(s).toBeHidden()
    await expect(card(page, ROSTER_SUBJECT)).toBeFocused()
    await expectScrollLock(page, false)

    // Backdrop tap.
    await card(page, ROSTER_SUBJECT).click()
    await expect(s).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 195, y: 40 } })
    await expect(s).toBeHidden()
    await expect(card(page, ROSTER_SUBJECT)).toBeFocused()
    await expectScrollLock(page, false)

    // Escape.
    await card(page, ROSTER_SUBJECT).click()
    await expect(s).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(s).toBeHidden()
    await expect(card(page, ROSTER_SUBJECT)).toBeFocused()

    // Open case → the detail page, where status, priority and notes live.
    await card(page, ROSTER_SUBJECT).click()
    await sheetActions(page, ROSTER_SUBJECT, "Case actions").filter({ hasText: "Open case" }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/cases/${ROSTER.id}$`))
    await expect(main(page).getByRole("heading", { level: 2, name: ROSTER_SUBJECT })).toBeVisible()
  })

  test("Delete from the Cases sheet: focus moves to the card now in its place, then to the heading", async ({ page }) => {
    await live(page)
    // evaluateAll does not auto-wait: wait for the inbox's list before taking
    // the index of the card to delete.
    await expect(cards(page)).toHaveCount(LIVE.data.cases.length)
    const titles = await cards(page).evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    const i = titles.findIndex((t) => t.startsWith(ROSTER_SUBJECT))
    expect(i, "the list includes the case to delete").toBeGreaterThanOrEqual(0)
    const next = titles[i + 1]
    expect(next, "a card follows it").toBeTruthy()
    await card(page, ROSTER_SUBJECT).click()
    await sheetActions(page, ROSTER_SUBJECT, "Case actions").filter({ hasText: "Delete case" }).click()
    const confirm = dialog(page, "Delete this case?")
    await expect(confirm).toBeVisible()
    await expect(sheet(page, ROSTER_SUBJECT)).toBeHidden()
    await confirm.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(card(page, ROSTER_SUBJECT)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(LIVE.data.cases.length - 1)
    await expect(cards(page).nth(i)).toBeFocused()
    await expect(cards(page).nth(i)).toHaveText(next!)

    // The last case: focus lands on the list heading.
    await live(page, "/crm/cases", keepCases(liveGmailSummary(Date.now()), [INVOICE.id]))
    await expect(cards(page)).toHaveCount(1)
    await cards(page).first().click()
    const only = page.getByRole("dialog").filter({ has: page.getByRole("group", { name: "Case actions" }) })
    await only.getByRole("button", { name: "Delete case" }).click()
    await dialog(page, "Delete this case?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(main(page).getByRole("status", { name: "No cases" })).toBeVisible()
    await expect(listHeading(page, "Cases")).toBeFocused()
  })

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
    await expect(page).toHaveURL(new RegExp(`/crm/cases/${ROSTER.id}$`))
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive CRM (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("Cases: ≤5 data columns plus one 44×44 '…' per row; toolbar per Deke 8:665", async ({ page }) => {
      await live(page)
      await expect(cardList(page)).toBeHidden()
      const t = table(page, "Cases")
      await expect(t.getByRole("columnheader")).toHaveText(["Subject", "Contact", "Status", "Priority", "Actions"])
      const row = t.getByRole("row", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) })
      await expect(row.getByText(new RegExp(`^#${ROSTER.caseNumber} · \\d+[mhd] ago$`))).toBeVisible()
      await expect(t.getByTestId("sample-data-tag")).toHaveCount(0)
      const menus = t.getByRole("button", { name: /^More actions for / })
      await expect(menus).toHaveCount(LIVE.data.cases.length)
      for (const more of await menus.all()) {
        await more.scrollIntoViewIfNeeded()
        const b = (await more.boundingBox())!
        expect(Math.round(b.width)).toBe(44)
        expect(Math.round(b.height)).toBe(44)
        // On screen, not scrolled off inside the table.
        const hit = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
          { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        )
        expect(hit).toBe(await more.getAttribute("aria-label"))
      }

      // Toolbar: status segment, priority select, search — all 44 tall, one line.
      const seg = statusFilter(page).getByRole("link", { name: "All", exact: true })
      const select = main(page).getByRole("combobox", { name: "Priority filter" })
      const input = main(page).getByRole("textbox", { name: "Search cases" })
      const tops = []
      for (const el of [seg, select, input]) {
        const b = (await el.boundingBox())!
        expect(b.height).toBeGreaterThanOrEqual(44)
        tops.push(Math.round(b.y + b.height / 2))
      }
      expect(Math.max(...tops) - Math.min(...tops), "toolbar on one line").toBeLessThanOrEqual(2)

      // The "…" menu: the phone sheet's actions, 44px rows.
      const more = t.getByRole("button", { name: ROSTER_MENU })
      await more.click()
      const menu = page.getByRole("menu")
      await expect(menu.getByRole("menuitem")).toHaveText(["Open case", "Delete case"])
      await settle(menu)
      await expectAllTargets44(menu, `${VIEWPORTS[name].width} case menu`)
      await menu.getByRole("menuitem", { name: "Delete case" }).click()
      const confirm = dialog(page, "Delete this case?")
      await expectDialog44(confirm, `${VIEWPORTS[name].width} delete case`)
      await confirm.getByRole("button", { name: "Delete", exact: true }).click()
      await expect(t.getByRole("row", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) })).toHaveCount(0)
      // Focus moves to the "…" of the row now in its place.
      await expect(t.getByRole("button", { name: /^More actions for / }).first()).toBeFocused()

      await t.getByRole("button", { name: new RegExp(`^More actions for #${INVOICE.caseNumber} `) }).click()
      await page.getByRole("menu").getByRole("menuitem", { name: "Open case" }).click()
      await expect(page).toHaveURL(new RegExp(`/crm/cases/${INVOICE.id}$`))
    })

    test("Contacts: the panel above; Email folds under Name; one 44×44 '…' with Open / Edit / Delete", async ({ page }) => {
      await own(page)
      await expectGmailPanel(page, "contacts")
      await expect(cardList(page)).toBeHidden()
      const t = table(page, "Contacts")
      await expect(t.getByRole("columnheader")).toHaveText(["Name", "Organization", "Plan", "Open cases", "Actions"])
      const row = t.getByRole("row", { name: new RegExp(PAT) })
      await expect(row.getByRole("cell").first().getByText("pat.reyes@example.org")).toBeVisible()
      await expect(row.getByRole("cell")).toHaveCount(5)
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

      // Cases (live): priority filter options; Delete case from the sheet / "…".
      await live(page)
      await main(page).getByRole("combobox", { name: "Priority filter" }).click()
      const options = page.getByRole("listbox")
      await expect(options).toBeVisible()
      await settle(options)
      await expectAllTargets44(options, `${size} priority filter options`)
      await page.keyboard.press("Escape")
      await expect(options).toBeHidden()
      if (phone) {
        await card(page, ROSTER_SUBJECT).click()
        await sheetActions(page, ROSTER_SUBJECT, "Case actions").filter({ hasText: "Delete case" }).click()
      } else {
        await table(page, "Cases").getByRole("button", { name: ROSTER_MENU }).click()
        await page.getByRole("menu").getByRole("menuitem", { name: "Delete case" }).click()
      }
      const delCase = dialog(page, "Delete this case?")
      await expectDialog44(delCase, `${size} delete case`)
      await page.keyboard.press("Escape")
      await expect(delCase).toBeHidden()

      // Case detail: priority options and the Delete confirm.
      await visit(page, `/crm/cases/${ROSTER.id}`)
      await main(page).getByRole("combobox", { name: "Priority" }).click()
      await expect(page.getByRole("listbox")).toBeVisible()
      await settle(page.getByRole("listbox"))
      await expectAllTargets44(page.getByRole("listbox"), `${size} case priority options`)
      await page.keyboard.press("Escape")
      await main(page).getByRole("button", { name: `Delete case #${ROSTER.caseNumber}` }).click()
      await expectDialog44(dialog(page, "Delete this case?"), `${size} detail delete case`)
      await page.keyboard.press("Escape")

      // Command palette, with results.
      await header(page).getByRole("button", { name: /^Search/ }).click()
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

for (const [size, viewport] of TOUCH_SIZES) {
  test.describe(`note composer (${size})`, () => {
    test.use({ viewport })

    test("multi-line text is never clipped: the field grows", async ({ page }) => {
      await live(page, `/crm/cases/${ROSTER.id}`)
      const note = main(page).getByRole("textbox", { name: "Internal note" })
      const before = (await note.boundingBox())!.height
      await note.fill(Array.from({ length: 8 }, (_, i) => `Line ${i + 1} of a long internal note`).join("\n"))
      const { scrollHeight, clientHeight } = await note.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))
      expect(scrollHeight, "no clipped lines").toBeLessThanOrEqual(clientHeight + 1)
      expect((await note.boundingBox())!.height, "grew with the text").toBeGreaterThan(before)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive CRM (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: original columns, no cards, no '…', develop's control sizes", async ({ page }) => {
    // Not connected, own contacts saved: the header's Clear and the Contacts table.
    await own(page)
    await expect(clearButton(page)).toHaveCSS("height", "24px")
    await expect(table(page, "Contacts").getByRole("columnheader")).toHaveText([
      "Name",
      "Email",
      "Organization",
      "Plan",
      "Open cases",
    ])
    await expect(main(page).getByRole("button", { name: /^More actions for / })).toHaveCount(0)
    await expect(cardList(page)).toBeHidden()

    // Live: the Cases table, its toolbar and a case.
    await live(page)
    await expect(cardList(page)).toBeHidden()
    const t = table(page, "Cases")
    await expect(t.getByRole("columnheader")).toHaveText(["#", "Subject", "Contact", "Status", "Priority", "Last activity"])
    await expect(t.getByRole("button", { name: /^More actions for / })).toHaveCount(0)
    await expect(t.getByText(new RegExp(`^#${ROSTER.caseNumber} · \\d+[mhd] ago$`))).toBeHidden()
    // develop's 28px: Nova's unlayered `size-sm` wins over the button's `h-9`.
    await expect(header(page).getByRole("button", { name: /^Search/ })).toHaveCSS("height", "28px")
    await expect(header(page).getByText("⌘K")).toBeVisible()
    await expect(main(page).getByRole("textbox", { name: "Search cases" })).toHaveCSS("height", "32px")
    await expect(main(page).getByRole("combobox", { name: "Priority filter" })).toHaveCSS("height", "28px")
    expect((await crmNav(page).getByRole("link", { name: "Cases", exact: true }).boundingBox())!.height).toBeLessThan(44)
    expect((await statusFilter(page).getByRole("link", { name: "All", exact: true }).boundingBox())!.height).toBeLessThan(44)

    await visit(page, `/crm/cases/${ROSTER.id}`)
    // A note, so its Delete is there to measure.
    await main(page).getByLabel("Internal note").fill("Asked Dana for the CSV.")
    await main(page).getByRole("button", { name: "Add note", exact: true }).click()
    await expect(main(page).getByText("Asked Dana for the CSV.")).toBeVisible()
    await expect(main(page).getByRole("group", { name: "Case status" }).getByRole("button").first()).toHaveCSS("height", "32px")
    await expect(main(page).getByRole("button", { name: `Delete case #${ROSTER.caseNumber}` })).toHaveCSS("height", "28px")
    await expect(main(page).getByRole("button", { name: "Delete note" }).first()).toHaveCSS("height", "24px")
    await main(page).getByRole("button", { name: `Delete case #${ROSTER.caseNumber}` }).click()
    const confirm = dialog(page, "Delete this case?")
    await expect(confirm).toBeVisible()
    await settle(confirm)
    await expect(confirm.getByRole("button", { name: "Delete", exact: true })).toHaveCSS("height", "32px")
    await expect(confirm.getByRole("button", { name: "Close", exact: true })).toHaveCSS("height", "28px")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

/* ------------------------------------------------------ filter contrast */

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of [...TOUCH_SIZES, ["1440", VIEWPORTS.desktop]] as const) {
    test.describe(`CRM status filter pressed contrast (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`the picked status is ≥3:1 against the rest in ${theme}`, async ({ page }) => {
        await live(page)
        await setTheme(page, theme)
        for (const name of ["All", "Open", "Closed"]) {
          await statusFilter(page).getByRole("link", { name, exact: true }).click()
          const pressed = statusFilter(page).locator("[aria-current='page']")
          await expect(pressed).toHaveText(name)
          await settle(pressed)
          const others = statusFilter(page).locator("a:not([aria-current])")
          expect(await others.count()).toBe(4)
          for (const other of await others.all()) {
            const ratio = await backgroundContrast(pressed, other)
            expect(ratio, `${theme}/${size} ${name} pressed vs ${await other.textContent()} ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
          }
          await expectReadable(pressed, `${theme}/${size} ${name} pressed`, expect)
        }
      })
    })
  }
}

/* --------------------------------------------------------------- readable */

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of TOUCH_SIZES) {
    test.describe(`readable CRM (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`new and restyled controls clear 4.5:1 in ${theme}`, async ({ page }) => {
        const phone = size === "390"
        const label = `${theme}/${size}`

        // Gmail not connected, own contacts saved: the header (Clear enabled,
        // so no longer exempt as an inactive control), the panel, the rows.
        await own(page)
        await setTheme(page, theme)
        await expectReadable(header(page).getByRole("heading", { level: 1 }), `${label}/title`, expect)
        await expectReadable(header(page).locator("p").first(), `${label}/lede`, expect)
        await expectReadable(persistenceNote(page), `${label}/note`, expect)
        await expectReadable(source(page), `${label}/not connected badge`, expect)
        await expectReadable(header(page).getByRole("button", { name: /^Search/ }), `${label}/Search`, expect)
        await expectReadable(crmNav(page), `${label}/section tabs`, expect)
        await expect(clearButton(page)).toBeEnabled()
        await expectTapTarget(clearButton(page), `${label}/Clear my entries`)
        await expectReadable(clearButton(page), `${label}/enabled Clear my entries`, expect)
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

        // Live: the Cases toolbar, cards / table, the sheet or "…", Delete's confirm.
        await live(page)
        await expectReadable(statusFilter(page), `${label}/status filter`, expect)
        await expectReadable(main(page).getByRole("combobox", { name: "Priority filter" }), `${label}/priority filter`, expect)
        if (phone) {
          await expectReadable(cardList(page), `${label}/case cards`, expect)
          await card(page, ROSTER_SUBJECT).click()
          const s = sheet(page, ROSTER_SUBJECT)
          await expect(s).toBeVisible()
          await settle(s)
          await expectReadable(s, `${label}/case sheet`, expect)
          await expectReadable(s.getByRole("button", { name: "Close", exact: true }), `${label}/sheet ×`, expect)
          await sheetActions(page, ROSTER_SUBJECT, "Case actions").filter({ hasText: "Delete case" }).click()
        } else {
          await expectReadable(table(page, "Cases"), `${label}/cases table`, expect)
          await table(page, "Cases").getByRole("button", { name: ROSTER_MENU }).click()
          const menu = page.getByRole("menu")
          await settle(menu)
          await expectReadable(menu, `${label}/case menu`, expect)
          await menu.getByRole("menuitem", { name: "Delete case" }).click()
        }
        const confirm = dialog(page, "Delete this case?")
        await expect(confirm).toBeVisible()
        await settle(confirm)
        await expectReadable(confirm, `${label}/delete case`, expect)
        await expectReadable(confirm.getByRole("button", { name: "Delete", exact: true }), `${label}/Delete`, expect)
        await page.keyboard.press("Escape")
        await expect(confirm).toBeHidden()

        // Triage: the touch-sized More menu (Always ignore is destructive text).
        await visit(page, "/crm/triage")
        await page.locator("[data-slot=triage-card]", { hasText: LIVE_TRIAGE.sam }).getByRole("button", { name: "More actions" }).click()
        const triageMenu = page.getByRole("menu")
        await settle(triageMenu)
        await expectReadable(triageMenu, `${label}/triage menu`, expect)
        await page.keyboard.press("Escape")
        await expect(triageMenu).toBeHidden()

        // The error state: 44px buttons, readable destructive text.
        const broken = `/crm/cases/${ROSTER.id}`
        await breakCaseDetail(page, broken)
        await page.goto(broken)
        const alert = main(page).getByRole("alert").filter({ hasText: "CRM couldn’t render" })
        await expect(alert).toBeVisible()
        await settle(alert)
        await expectAllTargets44(alert, `${label}/error state`)
        await expectReadable(alert, `${label}/error state`, expect)
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

    test("Cases: the renamed contacts (name, and email with no org) wrap; every '…' is reachable", async ({ page }) => {
      await live(page, "/crm/cases", longNamesInbox())
      const t = table(page, "Cases")
      await expect(t).toBeVisible()
      await expect(t.getByText(LONG_NAME_TEXT, { exact: true })).toHaveCount(2)
      await expect(t.getByText(LONG_NAME_NO_ORG.firstName, { exact: false })).toBeVisible()
      await expect(t.getByText(LONG_EMAIL_NO_ORG, { exact: true })).toBeVisible()
      await expectTableFits(page, "Cases", `${size} Cases`)
    })
  })
}

/* ------------------------- round 2, B2: breadcrumb back keeps your place */

const RETURN_KEY = "hotdash.crm.from-list"
const HOUR = 60 * 60 * 1000

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)
const historyLength = (page: Page) => page.evaluate(() => window.history.length)
const recorded = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), RETURN_KEY)
const crumb = (page: Page, list: "Cases" | "Contacts") =>
  main(page).locator("p", { hasText: new RegExp(`^${list} /`) }).getByRole("link", { name: list, exact: true })
const contactCrumb = (page: Page) => crumb(page, "Contacts")

/**
 * Twelve more open/high cases on Dana, each an hour older than the last and
 * all older than the roster case (itself open/high), so the filtered phone
 * list scrolls and ends on one of them.
 */
function manyOpenHighCases(): LiveGmailSummary {
  const inbox = liveGmailSummary(Date.now())
  const base = liveCase(inbox, LIVE_CASES.roster)
  const at = Date.parse(base.lastActivityAt ?? base.createdAt)
  const extra = Array.from({ length: 12 }, (_, n) => {
    const i = n + 1
    const when = new Date(at - i * HOUR).toISOString()
    return {
      ...base,
      id: `case-${100 + i}`,
      caseNumber: 200 + i,
      subject: `Scoreboard feed ${i} drops mid-game`,
      status: "open" as const,
      priority: "high" as const,
      lastActivityAt: when,
      lastInboundAt: when,
    }
  })
  return { ...inbox, data: { ...inbox.data, cases: [...inbox.data.cases, ...extra] } }
}

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

  test("Cases: from ?status=open&priority=high at the bottom, 'Cases' restores scroll, filters and history", async ({ page }) => {
    const LIST = "/crm/cases?status=open&priority=high"
    await live(page, LIST, manyOpenHighCases())
    await expect(cards(page)).toHaveCount(13)
    const before = await scrollToBottom(page)
    expect(before.y, "the filtered list scrolls").toBeGreaterThan(300)
    const h0 = await historyLength(page)

    await cards(page).last().click()
    const open = page.getByRole("dialog").getByRole("group", { name: "Case actions" }).getByRole("link", { name: "Open case" })
    await open.click()
    await expect(page).toHaveURL(/\/crm\/cases\/case-1\d\d$/)
    await expect(crumb(page, "Cases")).toBeVisible()
    expect(await historyLength(page)).toBe(h0 + 1)
    expect(await recorded(page)).not.toBeNull()

    await crumb(page, "Cases").click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === LIST)
    await expect(cards(page)).toHaveCount(13)
    await expectPlaceBack(page, before, "Cases")
    await expect(statusFilter(page).locator("[aria-current='page']")).toHaveText("Open")
    await expect(main(page).getByRole("combobox", { name: "Priority filter" })).toHaveText(/High/)
    expect(await historyLength(page), "Back, not a new entry").toBe(h0 + 1)
    expect(await recorded(page)).toBeNull()
  })

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
    // Cases: record a way back for one case, then land on another by URL.
    await live(page, "/crm/cases?status=open&priority=high", manyOpenHighCases())
    await cards(page).first().click()
    await page.getByRole("dialog").getByRole("group", { name: "Case actions" }).getByRole("link", { name: "Open case" }).click()
    await expect(page).toHaveURL(/\/crm\/cases\/case-/)
    await visit(page, `/crm/cases/${INVOICE.id}`)
    await expect.poll(() => recorded(page)).toBeNull()
    let h = await historyLength(page)
    await crumb(page, "Cases").click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/cases")
    await expect(statusFilter(page).locator("[aria-current='page']")).toHaveText("All")
    expect(await historyLength(page), "a plain link adds an entry").toBe(h + 1)

    // Contacts: straight to a contact by URL.
    await visit(page, `/crm/contacts/${DANA.id}`)
    h = await historyLength(page)
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

  test("Cases and Contacts round-trip by history from a filtered list; deep links stay plain", async ({ page }) => {
    await live(page, "/crm/cases?status=open&priority=high")
    const h0 = await historyLength(page)
    await table(page, "Cases").getByRole("link", { name: new RegExp(escapeRe(ROSTER_SUBJECT)) }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/cases/${ROSTER.id}$`))
    await crumb(page, "Cases").click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/cases?status=open&priority=high")
    await expect(statusFilter(page).locator("[aria-current='page']")).toHaveText("Open")
    expect(await historyLength(page)).toBe(h0 + 1)

    await visit(page, "/crm/contacts?q=ortiz")
    const h1 = await historyLength(page)
    await table(page, "Contacts").getByRole("link", { name: new RegExp(DANA_NAME) }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/${DANA.id}$`))
    await contactCrumb(page).click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/contacts?q=ortiz")
    await expect(main(page).getByRole("textbox", { name: "Search contacts" })).toHaveValue("ortiz")
    expect(await historyLength(page)).toBe(h1 + 1)

    await visit(page, `/crm/cases/${ROSTER.id}`)
    await crumb(page, "Cases").click()
    await expect(page).toHaveURL((url) => url.pathname + url.search === "/crm/cases")
  })
})
