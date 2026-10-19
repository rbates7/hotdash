import { expect, test, type Page } from "@playwright/test"

import {
  seedCases,
  seedContacts,
  seedMessages,
  seedNotes,
  seedOrganizations,
} from "../src/lib/crm/fixture"
import type { LiveGmailSummary } from "../src/lib/crm/gmail-summary"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import {
  CRM_LEDE,
  CRM_STORAGE_KEY as STORAGE_KEY,
  LIVE_CASES,
  LIVE_PEOPLE,
  LIVE_TRIAGE,
  OWN_CONTACTS,
  OWN_ID_BASE,
  expectGmailPanel,
  gmailPanel,
  liveCase,
  liveContact,
  openWithOwnContacts,
  ownCrmState,
  withPlans,
  type CrmScreen,
} from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { CLEAR_CONFIRM_NAME, NOTE, clearMyEntries, persistenceNote } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * The CRM with no sample rows. Gmail not connected (the real server, no
 * credentials): every screen shows a Not connected panel, and the only rows
 * are contacts the founder adds, saved in this browser and cleared with
 * "Clear my entries". Gmail connected: the fixture inbox from a mocked
 * /api/crm/gmail — editable on screen, never saved.
 */

const LIVE = liveGmailSummary(Date.now())
const ROSTER = liveCase(LIVE, LIVE_CASES.roster)
const DANA = liveContact(LIVE, LIVE_PEOPLE.dana.email)

/** Names and subjects from the old sample: none of them may show. */
const OLD_SAMPLE = ["Marcus Hale", "Staff seats invite fails on the iPad", "Riley Nash", "Alex Kim", "Westfield HS"]

const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const header = (page: Page) => page.getByRole("main").locator("header").first()
const source = (page: Page) => header(page).getByTestId("crm-source")
const note = (page: Page, opts?: { failed?: boolean }) => persistenceNote(page, opts)
const clearButton = (page: Page) => header(page).getByRole("button", { name: "Clear my entries", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const triageCards = (page: Page) => page.locator("[data-slot=triage-card]")
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)

const TABS: Array<[string | RegExp, CrmScreen]> = [
  ["Overview", "overview"],
  ["Cases", "cases"],
  ["Contacts", "contacts"],
  [/Triage/, "triage"],
]

/** Gmail not connected, nothing saved in this browser. */
async function freshCrm(page: Page, path = "/crm") {
  await page.goto(path)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("heading", { level: 1, name: "CRM" })).toBeVisible()
  await expect(source(page)).toHaveAttribute("data-source", "not_connected")
}

/** The fixture inbox through a mocked /api/crm/gmail. */
async function liveCrm(page: Page, path = "/crm", summary: LiveGmailSummary = liveGmailSummary(Date.now())) {
  await mockGmail(page, summary)
  await page.goto(path)
  await expect(source(page)).toHaveText("Live from Gmail")
}

/** Add a contact through the New contact dialog on Contacts. */
async function addContact(
  page: Page,
  { email, first, last, org }: { email: string; first: string; last: string; org: string }
) {
  await page.getByRole("button", { name: "New contact", exact: true }).click()
  const add = dialog(page, "New contact")
  await expect(add).toContainText(
    "Add someone by hand. Everyone else arrives from the support inbox once Gmail is connected."
  )
  await add.getByLabel("Email").fill(email)
  await add.getByLabel("First name").fill(first)
  await add.getByLabel("Last name").fill(last)
  await add.getByLabel("Organization").fill(org)
  await add.getByRole("button", { name: "Create contact", exact: true }).click()
  await expect(add).toBeHidden()
}

async function paddingLeft(locator: ReturnType<Page["getByLabel"]>) {
  return locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
}

test.describe("CRM, Gmail not connected", () => {
  test("is reachable from the sidebar; the overview says Gmail is not connected and shows no rows", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "CRM", exact: true }).click()
    await expect(page).toHaveURL(/\/crm$/)
    await expect(header(page).getByRole("heading", { level: 1, name: "CRM" })).toBeVisible()
    await expect(header(page).getByText(CRM_LEDE, { exact: true })).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "CRM", exact: true })).toHaveAttribute("data-active")
    await expect(source(page)).toHaveText("Gmail not connected")
    await expect(source(page)).toHaveAttribute("data-source", "not_connected")
    await expectGmailPanel(page, "overview")
    await expect(page.getByText(/open conversations/)).toHaveCount(0)
    await expect(page.getByRole("link", { name: /from unknown senders/ })).toHaveCount(0)
    await expect(page.getByRole("link", { name: /you added/ })).toHaveCount(0)
    await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toHaveText("Triage")
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
  })

  test("every screen shows its Not connected panel and none of the old sample", async ({ page }) => {
    await freshCrm(page)
    for (const [tab, screen] of TABS) {
      await crmNav(page).getByRole("link", { name: tab, exact: typeof tab === "string" }).click()
      await expectGmailPanel(page, screen)
      for (const old of OLD_SAMPLE) await expect(page.getByText(old)).toHaveCount(0)
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
    }
    // Cases and Triage: the panel stands in for the list, filters and cards.
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("heading", { level: 2, name: "Cases" })).toBeVisible()
    await expect(page.getByRole("table", { name: "Cases" })).toHaveCount(0)
    await expect(page.getByLabel("Search cases")).toHaveCount(0)
    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(triageCards(page)).toHaveCount(0)
    await expect(page.getByRole("status", { name: "Triage is clear" })).toHaveCount(0)
    // Contacts: the panel, then the founder's own (none yet).
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByText("0 people you added", { exact: true })).toBeVisible()
    const empty = page.getByRole("status", { name: "No contacts" })
    await expect(empty).toContainText("No contacts yet. Add someone by hand; they stay in this browser.")
    await expect(page.getByRole("button", { name: "New contact", exact: true })).toBeVisible()
  })

  test("a copy saved with the old sample loads without it; the founder's own contact stays", async ({ page }) => {
    const now = Date.now()
    const own = ownCrmState(OWN_CONTACTS.slice(0, 1), now)
    const top = (ids: string[]) => Math.max(0, ...ids.map((id) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0)))
    const organizations = [...seedOrganizations(now), ...own.organizations]
    const contacts = [...seedContacts(now), ...own.contacts]
    const cases = seedCases(now)
    const messages = seedMessages(now)
    const notes = seedNotes(now)
    const old = {
      organizations,
      contacts,
      cases,
      messages,
      notes,
      ignoredSenders: [],
      nextOrgId: top(organizations.map((o) => o.id)) + 1,
      nextContactId: top(contacts.map((c) => c.id)) + 1,
      nextCaseId: top(cases.map((c) => c.id)) + 1,
      nextMessageId: top(messages.map((m) => m.id)) + 1,
      nextNoteId: top(notes.map((n) => n.id)) + 1,
      nextCaseNumber: Math.max(...cases.map((c) => c.caseNumber)) + 1,
    }
    await page.goto("/crm/contacts")
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(old)] as const)
    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expectGmailPanel(page, "contacts")
    await expect(page.getByText("1 person you added", { exact: true })).toBeVisible()
    await expect(page.getByRole("table", { name: "Contacts" }).getByRole("row", { name: /Pat Reyes/ })).toBeVisible()
    for (const old of OLD_SAMPLE) await expect(page.getByText(old)).toHaveCount(0)
    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expect(page.getByRole("link", { name: "1 contact you added", exact: true })).toBeVisible()
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await freshCrm(page)
    await expectProbeCatchesSabotage(gmailPanel(page), "Not connected panel", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(gmailPanel(page), "Not connected panel (dark)", expect)
    await setTheme(page, "light")
  })

  test("the panels, badge and lede read at ≥ 4.5:1, light and dark", async ({ page }) => {
    await freshCrm(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(header(page).locator("p").first(), `${theme}/lede`, expect)
      await expectReadable(source(page), `${theme}/not connected badge`, expect)
      await expectReadable(note(page), `${theme}/note`, expect)
      for (const [tab, screen] of TABS) {
        await crmNav(page).getByRole("link", { name: tab, exact: typeof tab === "string" }).click()
        await expectReadable(await expectGmailPanel(page, screen), `${theme}/${screen} panel`, expect)
      }
    }
    await setTheme(page, "light")
  })

  test("the founder's own contacts and an enabled Clear my entries read at ≥ 4.5:1, light and dark", async ({ page }) => {
    await openWithOwnContacts(page, "/crm/contacts")
    await expect(page.getByText(`${OWN_CONTACTS.length} people you added`, { exact: true })).toBeVisible()
    await expect(clearButton(page)).toBeEnabled()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(page.getByRole("table", { name: "Contacts" }), `${theme}/own contacts`, expect)
      await expectReadable(clearButton(page), `${theme}/enabled Clear my entries`, expect)
    }
    await setTheme(page, "light")
  })

  test("add a contact: under the panel, on the overview, kept after reload; Clear my entries removes it", async ({
    page,
  }) => {
    await freshCrm(page)
    expect(await stored(page)).toBeNull()

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await addContact(page, { email: "pat@example.org", first: "Pat", last: "Reyes", org: "Katy ISD" })
    const table = page.getByRole("table", { name: "Contacts" })
    const row = table.getByRole("row", { name: /Pat Reyes/ })
    await expect(row).toBeVisible()
    await expect(row).toContainText("Katy ISD")
    await expect(page.getByText("1 person you added", { exact: true })).toBeVisible()
    await expect(row.getByTestId("sample-data-tag")).toHaveCount(0)
    // The founder's own rows sit under the panel, which stays.
    const panelBox = (await (await expectGmailPanel(page, "contacts")).boundingBox())!
    expect((await table.boundingBox())!.y, "own contacts under the panel").toBeGreaterThan(panelBox.y + panelBox.height)
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(clearButton(page)).toBeEnabled()
    expect(JSON.parse((await stored(page))!).contacts).toHaveLength(1)

    // Overview: still the panel, plus a link to what was added.
    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expectGmailPanel(page, "overview")
    const added = page.getByRole("link", { name: "1 contact you added", exact: true })
    await expect(added).toBeVisible()
    await added.click()
    await expect(page).toHaveURL(/\/crm\/contacts$/)

    // The contact's own page.
    await row.getByRole("link").click()
    await expect(page).toHaveURL(/\/crm\/contacts\/contact-\d+$/)
    await expect(page.getByRole("heading", { level: 2, name: "Pat Reyes" })).toBeVisible()

    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(page.getByRole("heading", { level: 2, name: "Pat Reyes" })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(row).toBeVisible()

    // Clear: Keep my edits keeps it; Clear removes it and the saved copy.
    await clearButton(page).click()
    const confirm = dialog(page, CLEAR_CONFIRM_NAME)
    await expect(confirm).toContainText(
      "This deletes everything you entered on this screen in this browser. There is no server copy to recover from."
    )
    await confirm.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(row).toBeVisible()

    await clearMyEntries(page, header(page))
    await expect(note(page)).toHaveText(NOTE.unsaved)
    await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
    expect(await stored(page)).toBeNull()
    await expect(page.getByText("Pat Reyes")).toHaveCount(0)
    await expect(page.getByRole("status", { name: "No contacts" })).toBeVisible()
    await expectGmailPanel(page, "contacts")
    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expectGmailPanel(page, "overview")
    await expect(page.getByRole("link", { name: /you added/ })).toHaveCount(0)
  })

  test("delete your own contact: Keep keeps them, Delete leaves the empty state", async ({ page }) => {
    await openWithOwnContacts(page, "/crm/contacts", OWN_CONTACTS.slice(0, 1))
    await page.getByRole("link", { name: /Pat Reyes/ }).click()
    await page.getByRole("button", { name: "Delete Pat Reyes" }).click()
    const confirm = dialog(page, "Delete this contact?")
    await confirm.getByRole("button", { name: "Keep them", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByRole("heading", { level: 2, name: "Pat Reyes" })).toBeVisible()
    await page.getByRole("button", { name: "Delete Pat Reyes" }).click()
    await dialog(page, "Delete this contact?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("status", { name: "Contact not found" })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByRole("status", { name: "No contacts" })).toBeVisible()
    await expect(page.getByText("0 people you added", { exact: true })).toBeVisible()
  })

  test("cmd-K finds the founder's own contacts", async ({ page }) => {
    await openWithOwnContacts(page, "/crm")
    await page.keyboard.press("Control+k")
    const palette = dialog(page, "Search CRM")
    await expect(palette).toBeVisible()
    expect(await paddingLeft(palette.getByLabel("Search cases and contacts"))).toBeGreaterThanOrEqual(32)
    await palette.getByLabel("Search cases and contacts").fill("reyes")
    await palette.getByRole("button", { name: /Pat Reyes/ }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/contact-${OWN_ID_BASE}$`))
    await expect(page.getByRole("heading", { level: 2, name: "Pat Reyes" })).toBeVisible()
  })

  test("New contact from the keyboard focuses Email; Escape returns focus to the button", async ({ page }) => {
    await freshCrm(page)
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    const button = page.getByRole("button", { name: "New contact", exact: true })
    await button.focus()
    await page.keyboard.press("Enter")
    const add = dialog(page, "New contact")
    await expect(add).toBeVisible()
    await expect(add.getByLabel("Email")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(add).toBeHidden()
    await expect(button).toBeFocused()
  })

  test("duplicate and malformed emails stay in the dialog with an inline error", async ({ page }) => {
    await openWithOwnContacts(page, "/crm/contacts")
    await page.getByRole("button", { name: "New contact", exact: true }).click()
    const add = dialog(page, "New contact")
    const email = add.getByLabel("Email")
    await email.fill(OWN_CONTACTS[0]!.email)
    await add.getByRole("button", { name: "Create contact", exact: true }).click()
    await expect(add).toBeVisible()
    await expect(add.getByRole("alert")).toHaveText("A contact with this email already exists.")
    await expect(email).toHaveAttribute("aria-invalid", "true")
    await expect(email).toHaveAttribute("aria-describedby", "new-email-error")
    await expect(email).toBeFocused()

    await email.fill("not-an-email")
    await add.getByRole("button", { name: "Create contact", exact: true }).click()
    await expect(add).toBeVisible()
    await expect(add.getByRole("alert")).toHaveText("Enter a valid email address.")
    await expect(email).toHaveAttribute("aria-invalid", "true")
    await expect(email).toBeFocused()
  })
})

test.describe("CRM, Gmail connected (mocked)", () => {
  test("the triage banner count matches the triage cards", async ({ page }) => {
    await liveCrm(page)
    const banner = page.getByRole("link", { name: /from unknown senders waiting in triage/ })
    await expect(banner).toBeVisible()
    const label = (await banner.getAttribute("aria-label")) ?? ""
    const count = Number.parseInt(label, 10)
    expect(count).toBe(Object.keys(LIVE_TRIAGE).length)
    await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toContainText(String(count))
    await banner.click()
    await expect(page).toHaveURL(/\/crm\/triage/)
    await expect(triageCards(page)).toHaveCount(count)
  })

  test("search inputs keep a 32px left pad so the icon does not overlap", async ({ page }) => {
    await liveCrm(page)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    expect(await paddingLeft(page.getByLabel("Search cases"))).toBeGreaterThanOrEqual(32)
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    expect(await paddingLeft(page.getByLabel("Search contacts"))).toBeGreaterThanOrEqual(32)
    await page.keyboard.press("Control+k")
    const palette = dialog(page, "Search CRM")
    await expect(palette).toBeVisible()
    expect(await paddingLeft(palette.getByLabel("Search cases and contacts"))).toBeGreaterThanOrEqual(32)
  })

  test("open a case, change status and priority, add a note, promote triage: on screen only, gone after reload", async ({
    page,
  }) => {
    await liveCrm(page)
    await expect(header(page).getByTestId("crm-read-only")).toHaveText("Read-only · edits here aren't saved")
    await expect(clearButton(page)).toHaveCount(0)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await page.getByRole("link", { name: new RegExp(LIVE_CASES.roster) }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/cases/${ROSTER.id}$`))
    await expect(page.getByRole("heading", { level: 2, name: LIVE_CASES.roster })).toBeVisible()

    await page.getByRole("button", { name: "Waiting on customer" }).click()
    await expect(page.getByText(/Status changed to Waiting on customer/)).toBeVisible()
    await page.getByRole("combobox", { name: "Priority" }).click()
    await page.getByRole("option", { name: "Urgent", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("Urgent")
    await page.getByLabel("Internal note").fill("Asked Dana for the CSV.")
    await page.getByRole("button", { name: "Add note", exact: true }).click()
    await expect(page.getByText("Asked Dana for the CSV.")).toBeVisible()

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    const sam = triageCards(page).filter({ hasText: LIVE_TRIAGE.sam })
    await sam.getByRole("button", { name: "Promote to case", exact: true }).click()
    await expect(page.getByText(LIVE_TRIAGE.sam)).toHaveCount(0)
    await expect(triageCards(page).filter({ hasText: LIVE_TRIAGE.jordan })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByRole("row", { name: new RegExp(LIVE_TRIAGE.sam) })).toBeVisible()

    // Nothing reached this browser's storage; the next copy starts clean.
    expect(await stored(page)).toBeNull()
    await page.reload()
    await expect(source(page)).toHaveText("Live from Gmail")
    await expect(page.getByRole("row", { name: new RegExp(LIVE_TRIAGE.sam) })).toHaveCount(0)
    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(triageCards(page).filter({ hasText: LIVE_TRIAGE.sam })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await page.getByRole("link", { name: new RegExp(LIVE_CASES.roster) }).click()
    await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("High")
    await expect(page.getByText("Asked Dana for the CSV.")).toHaveCount(0)
    expect(await stored(page)).toBeNull()
  })

  test("cmd-K searches cases and contacts", async ({ page }) => {
    await liveCrm(page)
    await page.keyboard.press("Control+k")
    const palette = dialog(page, "Search CRM")
    await expect(palette).toBeVisible()
    await palette.getByLabel("Search cases and contacts").fill(`#${ROSTER.caseNumber}`)
    await expect(palette.getByText(LIVE_CASES.roster)).toBeVisible()
    await palette.getByRole("button", { name: new RegExp(LIVE_CASES.roster) }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/cases/${ROSTER.id}$`))

    await page.keyboard.press("Control+k")
    await palette.getByLabel("Search cases and contacts").fill("ortiz")
    await palette.getByRole("button", { name: new RegExp(LIVE_PEOPLE.dana.email) }).click()
    await expect(page).toHaveURL(new RegExp(`/crm/contacts/${DANA.id}$`))
  })

  test("delete a case and a contact: Keep keeps it, Delete cascades, empty states show", async ({ page }) => {
    await liveCrm(page)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await page.getByRole("link", { name: new RegExp(LIVE_CASES.roster) }).click()
    await page.getByRole("button", { name: /Delete case/ }).click()
    const caseConfirm = dialog(page, "Delete this case?")
    await expect(caseConfirm).toBeVisible()
    await caseConfirm.getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(caseConfirm).toBeHidden()
    await expect(page.getByRole("heading", { level: 2, name: LIVE_CASES.roster })).toBeVisible()

    await page.getByRole("button", { name: /Delete case/ }).click()
    await dialog(page, "Delete this case?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("status", { name: "Case not found" })).toBeVisible()

    // Dana's other case goes with her.
    const dana = LIVE_PEOPLE.dana.name
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await page.getByRole("link", { name: new RegExp(dana) }).click()
    await page.getByRole("button", { name: `Delete ${dana}` }).click()
    const contactConfirm = dialog(page, "Delete this contact?")
    await expect(contactConfirm).toBeVisible()
    await contactConfirm.getByRole("button", { name: "Keep them", exact: true }).click()
    await expect(contactConfirm).toBeHidden()
    await expect(page.getByRole("heading", { level: 2, name: dana })).toBeVisible()

    await page.getByRole("button", { name: `Delete ${dana}` }).click()
    await dialog(page, "Delete this contact?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("status", { name: "Contact not found" })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("table", { name: "Cases" })).toBeVisible()
    await expect(page.getByRole("link", { name: new RegExp(LIVE_CASES.roster) })).toHaveCount(0)
    await expect(page.getByRole("link", { name: new RegExp(LIVE_CASES.assistants) })).toHaveCount(0)

    for (let i = 0; i < 8; i++) {
      await expect(page.getByRole("heading", { level: 2, name: "Cases" })).toBeVisible()
      const empty = page.getByRole("status", { name: "No cases" })
      if (await empty.isVisible()) break
      const table = page.getByRole("table", { name: "Cases" })
      await expect(table).toBeVisible()
      await table.locator("tbody tr").first().locator("td").nth(1).getByRole("link").click()
      await page.getByRole("button", { name: /Delete case/ }).click()
      await dialog(page, "Delete this case?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(page.getByRole("status", { name: "Case not found" })).toBeVisible()
      await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    }
    await expect(page.getByRole("status", { name: "No cases" })).toContainText(
      "No conversations the inbox has replied to yet. Promote a triage thread to open a case."
    )

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    for (let i = 0; i < 8; i++) {
      await expect(page.getByRole("heading", { level: 2, name: "Contacts" })).toBeVisible()
      const empty = page.getByRole("status", { name: "No contacts" })
      if (await empty.isVisible()) break
      const table = page.getByRole("table", { name: "Contacts" })
      await expect(table).toBeVisible()
      await table.locator("tbody tr").first().getByRole("link").click()
      await page.getByRole("button", { name: /^Delete / }).click()
      await dialog(page, "Delete this contact?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(page.getByRole("status", { name: "Contact not found" })).toBeVisible()
      await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    }
    await expect(page.getByRole("status", { name: "No contacts" })).toContainText(
      "Nobody the inbox has replied to yet. Add someone by hand, or promote a triage thread."
    )

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(page.getByRole("heading", { level: 2, name: "Triage" })).toBeVisible()
    for (let i = 0; i < 4; i++) {
      const clear = page.getByRole("status", { name: "Triage is clear" })
      if (await clear.isVisible()) break
      await expect(triageCards(page).first()).toBeVisible()
      await triageCards(page).first().getByRole("button", { name: "More actions" }).click()
      await page.getByRole("menuitem", { name: "Ignore this thread" }).click()
    }
    await expect(page.getByRole("status", { name: "Triage is clear" })).toBeVisible()

    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expect(page.getByRole("status", { name: "No CRM data" })).toContainText(
      "No conversations in info@chlkapp.com in the last 90 days."
    )
    await expect(gmailPanel(page)).toHaveCount(0)
    expect(await stored(page)).toBeNull()
  })

  test("contrast is ≥ 4.5:1 in light and dark on Contacts, triage, case detail, and Overview", async ({ page }) => {
    await liveCrm(page, "/crm", withPlans(liveGmailSummary(Date.now())))
    // A note on the case, so the note card has something to measure.
    await page.goto(`/crm/cases/${ROSTER.id}`)
    await page.getByLabel("Internal note").fill("Asked Dana for the CSV.")
    await page.getByRole("button", { name: "Add note", exact: true }).click()
    await expect(page.getByText("Asked Dana for the CSV.")).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(source(page), `${theme}/live badge`, expect)

      await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
      await expect(page.getByRole("table", { name: "Contacts" })).toBeVisible()
      const pills = page.getByTestId("plan-pill")
      await expect(pills).toHaveCount(2)
      await expect(page.getByRole("row", { name: new RegExp(LIVE_PEOPLE.ben.name) }).getByTestId("plan-pill")).toHaveClass(
        /line-through/
      )
      for (const pill of await pills.all()) {
        await expectReadable(pill, `${theme}/plan pill`, expect)
      }

      await crmNav(page).getByRole("link", { name: /Triage/ }).click()
      await expect(triageCards(page)).toHaveCount(2)
      for (const card of await triageCards(page).all()) {
        await expectReadable(card, `${theme}/triage card`, expect)
      }

      await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
      await expect(page.getByRole("table", { name: "Cases" }).locator("tbody tr")).toHaveCount(LIVE.data.cases.length)
      for (const pill of await page.getByTestId("status-pill").all()) {
        await expectReadable(pill, `${theme}/status`, expect)
      }
      for (const pill of await page.getByTestId("priority-pill").all()) {
        await expectReadable(pill, `${theme}/priority`, expect)
      }
      await page.getByRole("link", { name: new RegExp(LIVE_CASES.roster) }).click()
      await expectReadable(page.getByRole("group", { name: "Case status" }), `${theme}/status path`, expect)
      const noteCard = page.getByText("Asked Dana for the CSV.").locator("..")
      await expectReadable(noteCard, `${theme}/note card`, expect)

      await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
      await expectReadable(page.getByRole("link", { name: /from unknown senders/ }), `${theme}/banner`, expect)
      await expectReadable(page.getByRole("link", { name: "1 New" }), `${theme}/stat`, expect)
    }
    await setTheme(page, "light")
  })
})
