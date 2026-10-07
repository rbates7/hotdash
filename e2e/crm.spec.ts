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

async function freshCrm(page: Page) {
  await page.goto("/crm")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("heading", { level: 1, name: "CRM" })).toBeVisible()
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
    await expect(page.getByText(/2 messages from unknown senders/)).toBeVisible()
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

  test("happy path: open a case, change status and priority, add a note, add a contact, resolve triage, persist after reload", async ({
    page,
  }) => {
    await freshCrm(page)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page).toHaveURL(/\/crm\/cases$/)
    await page.getByRole("link", { name: /Can't invite teammates to workspace/ }).click()
    await expect(page).toHaveURL(/\/crm\/cases\/case-1$/)
    await expect(page.getByRole("heading", { level: 2, name: /Can't invite teammates/ })).toBeVisible()

    await page.getByRole("button", { name: "Waiting on customer" }).click()
    await expect(page.getByText(/Status changed to Waiting on customer/)).toBeVisible()
    await page.getByRole("combobox", { name: "Priority" }).click()
    await page.getByRole("option", { name: "Urgent", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("Urgent")

    await page.getByLabel("Internal note").fill("Called Dana, waiting on a screenshot.")
    await page.getByRole("button", { name: "Add note", exact: true }).click()
    await expect(page.getByText("Called Dana, waiting on a screenshot.")).toBeVisible()
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
    const lena = page.locator("[data-slot=triage-card]", { hasText: "Lena Ortiz" })
    await expect(lena).toBeVisible()
    await lena.getByRole("button", { name: "Promote to case", exact: true }).click()
    await expect(page.getByText("Lena Ortiz")).toHaveCount(0)
    await expect(page.getByText("Alex Kim")).toBeVisible()

    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(page.getByText("Alex Kim")).toBeVisible()
    await expect(page.getByText("Lena Ortiz")).toHaveCount(0)
    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await page.getByRole("link", { name: /Can't invite teammates to workspace/ }).click()
    await expect(page.getByText("Called Dana, waiting on a screenshot.")).toBeVisible()
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
    await expect(page.getByText("Lena Ortiz")).toBeVisible()
  })

  test("cmd-K searches cases and contacts", async ({ page }) => {
    await freshCrm(page)
    await page.keyboard.press("Control+k")
    const palette = dialog(page, "Search CRM")
    await expect(palette).toBeVisible()
    await palette.getByLabel("Search cases and contacts").fill("#3")
    await expect(palette.getByText("CSV export times out on large ranges")).toBeVisible()
    await palette.getByRole("button", { name: /CSV export/ }).click()
    await expect(page).toHaveURL(/\/crm\/cases\/case-3$/)
  })
})
