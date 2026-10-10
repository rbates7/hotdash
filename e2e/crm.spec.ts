import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

const STORAGE_KEY = "hotdash.crm.v1"

const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const header = (page: Page) => page.getByRole("main").locator("header").first()
const note = (page: Page, opts?: { failed?: boolean }) => persistenceNote(page, opts)
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const triageCards = (page: Page) => page.locator("[data-slot=triage-card]")

async function freshCrm(page: Page) {
  await page.goto("/crm")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("heading", { level: 1, name: "CRM" })).toBeVisible()
}

async function paddingLeft(locator: ReturnType<Page["getByLabel"]>) {
  return locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
}

test.describe("CRM", () => {
  test("is reachable from the sidebar and shows the overview", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "CRM", exact: true }).click()
    await expect(page).toHaveURL(/\/crm$/)
    await expect(header(page).getByRole("heading", { level: 1, name: "CRM" })).toBeVisible()
    await expect(header(page).getByText(/Conversations, contacts, and triage/)).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "CRM", exact: true })).toHaveAttribute("data-active")
    await expect(page.getByText(/6 contacts/)).toBeVisible()
    await expect(page.getByText(/2 conversations from unknown senders/)).toBeVisible()
    await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toContainText("2")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await freshCrm(page)
    await expectProbeCatchesSabotage(header(page).getByTestId("sample-data-tag"), "header tag", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(header(page).getByTestId("sample-data-tag"), "header tag (dark)", expect)
    await setTheme(page, "light")
  })

  test("labels seed rows as sample data, readable at ≥ 4.5:1, light and dark", async ({ page }) => {
    await freshCrm(page)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("table", { name: "Cases" })).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(header(page).getByTestId("sample-data-tag"), `${theme}/header tag`, expect)
      const tags = page.getByRole("table", { name: "Cases" }).getByTestId("sample-data-tag")
      await expect(tags).toHaveCount(8)
      for (const tag of await tags.all()) {
        await expect(tag).toHaveText("Sample data")
        await expectReadable(tag, `${theme}/case tag`, expect)
      }
      for (const pill of await page.getByTestId("status-pill").all()) {
        await expectReadable(pill, `${theme}/status`, expect)
      }
      for (const pill of await page.getByTestId("priority-pill").all()) {
        await expectReadable(pill, `${theme}/priority`, expect)
      }
    }
    await setTheme(page, "light")
  })

  test("seed triage cards and overview activity carry Sample tags at ≥ 4.5:1", async ({ page }) => {
    await freshCrm(page)
    const overviewTags = page.getByTestId("sample-data-tag")
    expect(await overviewTags.count()).toBeGreaterThanOrEqual(4)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      for (const tag of await overviewTags.all()) {
        await expect(tag).toHaveText(/Sample data/)
        await expectReadable(tag, `${theme}/overview tag`, expect)
      }
    }
    await setTheme(page, "light")
    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    const triageTags = triageCards(page).getByTestId("sample-data-tag")
    await expect(triageTags).toHaveCount(2)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      for (const tag of await triageTags.all()) {
        await expect(tag).toHaveText("Sample data")
        await expectReadable(tag, `${theme}/triage tag`, expect)
      }
    }
    await setTheme(page, "light")
  })

  test("the triage banner count matches the triage cards", async ({ page }) => {
    await freshCrm(page)
    const banner = page.getByRole("link", { name: /from unknown senders waiting in triage/ })
    await expect(banner).toBeVisible()
    const label = (await banner.getAttribute("aria-label")) ?? ""
    const count = Number.parseInt(label, 10)
    expect(count).toBeGreaterThan(0)
    await banner.click()
    await expect(page).toHaveURL(/\/crm\/triage/)
    await expect(triageCards(page)).toHaveCount(count)
  })

  test("search inputs keep a 32px left pad so the icon does not overlap", async ({ page }) => {
    await freshCrm(page)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    expect(await paddingLeft(page.getByLabel("Search cases"))).toBeGreaterThanOrEqual(32)
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    expect(await paddingLeft(page.getByLabel("Search contacts"))).toBeGreaterThanOrEqual(32)
    await page.keyboard.press("Control+k")
    const palette = dialog(page, "Search CRM")
    await expect(palette).toBeVisible()
    expect(await paddingLeft(palette.getByLabel("Search cases and contacts"))).toBeGreaterThanOrEqual(32)
  })

  test("happy path: open a case, change status and priority, add a note, add a contact, resolve triage, persist after reload", async ({
    page,
  }) => {
    await freshCrm(page)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await page.getByRole("link", { name: /Staff seats invite fails on the iPad/ }).click()
    await expect(page).toHaveURL(/\/crm\/cases\/case-1$/)
    await expect(page.getByRole("heading", { level: 2, name: /Staff seats invite fails/ })).toBeVisible()

    await page.getByRole("button", { name: "Waiting on customer" }).click()
    await expect(page.getByText(/Status changed to Waiting on customer/)).toBeVisible()
    await page.getByRole("combobox", { name: "Priority" }).click()
    await page.getByRole("option", { name: "Urgent", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("Urgent")

    await page.getByLabel("Internal note").fill("Called Marcus, waiting on a screenshot.")
    await page.getByRole("button", { name: "Add note", exact: true }).click()
    await expect(page.getByText("Called Marcus, waiting on a screenshot.")).toBeVisible()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(resetButton(page)).toBeEnabled()

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await header(page)
      .page()
      .getByRole("button", { name: "New contact", exact: true })
      .click()
    const add = dialog(page, "New contact")
    await add.getByLabel("Email").fill("pat@katyisd.org")
    await add.getByLabel("First name").fill("Pat")
    await add.getByLabel("Last name").fill("Reyes")
    await add.getByLabel("Organization").fill("Katy ISD")
    await add.getByRole("button", { name: "Create contact", exact: true }).click()
    await expect(add).toBeHidden()
    await expect(page.getByRole("row", { name: /Pat Reyes/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /Pat Reyes/ }).getByTestId("sample-data-tag")).toHaveCount(0)

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    const riley = page.locator("[data-slot=triage-card]", { hasText: "Riley Nash" })
    await expect(riley).toBeVisible()
    await riley.getByRole("button", { name: "Promote to case", exact: true }).click()
    await expect(page.getByText("Riley Nash")).toHaveCount(0)
    await expect(page.getByText("Alex Kim")).toBeVisible()

    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(page.getByText("Alex Kim")).toBeVisible()
    await expect(page.getByText("Riley Nash")).toHaveCount(0)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await page.getByRole("link", { name: /Staff seats invite fails on the iPad/ }).click()
    await expect(page.getByText("Called Marcus, waiting on a screenshot.")).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("Urgent")
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByRole("row", { name: /Pat Reyes/ })).toBeVisible()

    await resetButton(page).click()
    const confirm = dialog(page, "Reset demo data?")
    await confirm.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(page.getByRole("row", { name: /Pat Reyes/ })).toBeVisible()

    await resetDemoData(page, header(page))
    await expect(note(page)).toHaveText(NOTE.unsaved)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(page.getByText("Pat Reyes")).toHaveCount(0)
    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(page.getByText("Riley Nash")).toBeVisible()
  })

  test("cmd-K searches cases and contacts", async ({ page }) => {
    await freshCrm(page)
    await page.keyboard.press("Control+k")
    const palette = dialog(page, "Search CRM")
    await expect(palette).toBeVisible()
    await palette.getByLabel("Search cases and contacts").fill("#3")
    await expect(palette.getByText("Playbook sync times out on a full install")).toBeVisible()
    await palette.getByRole("button", { name: /Playbook sync/ }).click()
    await expect(page).toHaveURL(/\/crm\/cases\/case-3$/)
  })

  test("delete a case and a contact: Keep keeps it, Delete cascades, empty states show", async ({
    page,
  }) => {
    await freshCrm(page)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await page.getByRole("link", { name: /Staff seats invite fails on the iPad/ }).click()
    await page.getByRole("button", { name: /Delete case/ }).click()
    const caseConfirm = dialog(page, "Delete this case?")
    await expect(caseConfirm).toBeVisible()
    await caseConfirm.getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(caseConfirm).toBeHidden()
    await expect(page.getByRole("heading", { level: 2, name: /Staff seats invite fails/ })).toBeVisible()

    await page.getByRole("button", { name: /Delete case/ }).click()
    await dialog(page, "Delete this case?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("status", { name: "Case not found" })).toBeVisible()

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await page.getByRole("link", { name: /Marcus Hale/ }).click()
    await page.getByRole("button", { name: "Delete Marcus Hale" }).click()
    const contactConfirm = dialog(page, "Delete this contact?")
    await expect(contactConfirm).toBeVisible()
    await contactConfirm.getByRole("button", { name: "Keep them", exact: true }).click()
    await expect(contactConfirm).toBeHidden()
    await expect(page.getByRole("heading", { level: 2, name: "Marcus Hale" })).toBeVisible()

    await page.getByRole("button", { name: "Delete Marcus Hale" }).click()
    await dialog(page, "Delete this contact?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("status", { name: "Contact not found" })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("link", { name: /Staff seats invite fails/ })).toHaveCount(0)
    await expect(page.getByRole("link", { name: /Billing question about Annual seats/ })).toHaveCount(0)

    for (let i = 0; i < 16; i++) {
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
    await expect(page.getByRole("status", { name: "No cases" })).toBeVisible()

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    for (let i = 0; i < 16; i++) {
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
    await expect(page.getByRole("status", { name: "No contacts" })).toBeVisible()

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(page.getByRole("heading", { level: 2, name: "Triage" })).toBeVisible()
    for (let i = 0; i < 8; i++) {
      const clear = page.getByRole("status", { name: "Triage is clear" })
      if (await clear.isVisible()) break
      await expect(triageCards(page).first()).toBeVisible()
      await triageCards(page).first().getByRole("button", { name: "More actions" }).click()
      await page.getByRole("menuitem", { name: "Ignore this thread" }).click()
    }
    await expect(page.getByRole("status", { name: "Triage is clear" })).toBeVisible()

    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expect(page.getByRole("status", { name: "No CRM data" })).toBeVisible()
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("status", { name: "No cases" })).toBeVisible()
  })

  test("New contact from the keyboard focuses Email; Escape returns focus to the button", async ({
    page,
  }) => {
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
    await freshCrm(page)
    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await page.getByRole("button", { name: "New contact", exact: true }).click()
    const add = dialog(page, "New contact")
    const email = add.getByLabel("Email")
    await email.fill("mhale@westfieldfb.org")
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

  test("contrast is ≥ 4.5:1 in light and dark on Contacts, triage, case detail, and Overview", async ({
    page,
  }) => {
    await freshCrm(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)

      await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
      await expect(page.getByRole("table", { name: "Contacts" })).toBeVisible()
      const pills = page.getByTestId("plan-pill")
      await expect(pills).toHaveCount(6)
      await expect(page.getByRole("row", { name: /Elena Vasquez/ }).getByTestId("plan-pill")).toHaveClass(
        /line-through/
      )
      for (const pill of await pills.all()) {
        await expectReadable(pill, `${theme}/plan pill`, expect)
      }

      await crmNav(page).getByRole("link", { name: /Triage/ }).click()
      for (const card of await triageCards(page).all()) {
        await expectReadable(card, `${theme}/triage card`, expect)
      }

      await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
      await page.getByRole("link", { name: /Staff seats invite fails on the iPad/ }).click()
      await expectReadable(page.getByRole("group", { name: "Case status" }), `${theme}/status path`, expect)
      const seedNote = page.getByText(/Reproduced on the staff iPad/).locator("..")
      await expectReadable(seedNote, `${theme}/note card`, expect)
      await expectReadable(seedNote.getByTestId("sample-data-tag"), `${theme}/note tag`, expect)

      await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
      await expectReadable(page.getByRole("link", { name: /from unknown senders/ }), `${theme}/banner`, expect)
      await expectReadable(page.getByRole("link", { name: "1 New" }), `${theme}/stat`, expect)
    }
    await setTheme(page, "light")
  })
})
