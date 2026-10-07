import { expect, test, type BrowserContext, type Page } from "@playwright/test"

import { addDays, formatDate, now, todayIn } from "../src/lib/clock"
import { expectReadable } from "./support/contrast"
import { NOTE, resetDemoData } from "./support/persistence"

const STORAGE_KEY = "hotdash.sales-opportunities.v1"

/**
 * Today on the founder's calendar (America/Chicago), from the same helper the
 * page uses. Read per test so a run that straddles Chicago midnight compares
 * against the day the page itself rendered with.
 */
const today = () => todayIn(now())

// Every lookup is scoped to a landmark by role and name — the page region,
// the Deals region inside it, the table, a named dialog or menu — so no
// page-wide text match can ever hit two elements.
const rail = (page: Page) => page.locator('[data-slot="sidebar"]').first()
const screen = (page: Page) => page.getByRole("region", { name: "Sales Opportunities", exact: true })
const deals = (page: Page) => screen(page).getByRole("region", { name: "Deals", exact: true })
const table = (page: Page) => deals(page).getByRole("table", { name: "Deals", exact: true })
const rows = (page: Page) => table(page).locator("tbody").getByRole("row")
const row = (page: Page, who: RegExp) => table(page).getByRole("row", { name: who })
const note = (page: Page) => screen(page).getByTestId("persistence-note")
const resetButton = (page: Page) => screen(page).getByRole("button", { name: "Reset", exact: true })
const filter = (page: Page, name: string) =>
  deals(page).getByRole("group", { name: "Show deals" }).getByRole("button", { name, exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function fresh(page: Page) {
  await page.goto("/sales-opportunities")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  // Nothing edited in this browser yet, so nothing is saved — and it says so.
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toBeDisabled()
  await expect(rows(page)).toHaveCount(6)
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await rail(page).getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

async function addDeal(page: Page, who: string, org: string, what: string, value: string, nextStep: string, due?: string) {
  await deals(page).getByRole("button", { name: "Add deal", exact: true }).click()
  const add = dialog(page, "Add deal")
  await add.getByRole("textbox", { name: "Who" }).fill(who)
  await add.getByRole("textbox", { name: "School / org" }).fill(org)
  await add.getByRole("textbox", { name: "What they're buying" }).fill(what)
  await add.getByRole("textbox", { name: "Value" }).fill(value)
  await add.getByRole("textbox", { name: "Next step" }).fill(nextStep)
  if (due) await add.getByLabel("Due date").fill(due)
  await add.getByRole("button", { name: "Add deal", exact: true }).click()
  await expect(add).toBeHidden()
}

/** Count `localStorage.setItem` calls from before the page's scripts run. */
async function countWrites(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    const w = window as Window & { __writes?: number }
    w.__writes = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage) w.__writes = (w.__writes ?? 0) + 1
      return original.call(this, key, value)
    }
  })
}
const writes = (page: Page) => page.evaluate(() => (window as Window & { __writes?: number }).__writes ?? 0)

test.describe("Sales Opportunities", () => {
  test("is reachable from the sidebar and shows the live deals, soonest next step first", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "Sales Opportunities", exact: true }).click()
    await expect(page).toHaveURL(/\/sales-opportunities$/)
    await expect(rail(page).getByRole("link", { name: "Sales Opportunities", exact: true })).toHaveAttribute("data-active")

    const region = screen(page)
    await expect(region.getByRole("heading", { level: 1, name: "Sales Opportunities" })).toBeVisible()
    await expect(region.getByText("Live deals only — a hunt becomes a deal when someone is talking.")).toBeVisible()
    await expect(region.locator("header").getByTestId("sample-data-tag")).toHaveText("Sample data")
    await expect(note(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
    await expect(deals(page).getByTestId("source-chip")).toHaveAttribute("aria-disabled", "true")

    await expect(table(page).getByRole("columnheader")).toHaveText([
      "Who",
      "What they're buying",
      "Value",
      "Stage",
      "Next step",
      "Owner",
      "Last touch",
      "Actions",
    ])
    // Open by default: six of the eight seed deals; the won and lost ones are hidden.
    await expect(filter(page, "Open")).toHaveAttribute("aria-pressed", "true")
    await expect(rows(page)).toHaveCount(6)
    await expect(rows(page).first()).toContainText("Coach Lonnie Pruitt")
    await expect(rows(page).last()).toContainText("Coach Tommy Hale")

    // Real clock, Central days: the overdue rows are dated from today.
    const day = today()
    const pruitt = row(page, /Pruitt/)
    await expect(pruitt).toHaveAttribute("data-overdue", "true")
    await expect(pruitt).toContainText(formatDate(addDays(day, -2)))
    await expect(pruitt).toContainText("Overdue 2 days")
    await expect(pruitt).toContainText("6 days ago")
    await expect(row(page, /Whitaker/)).toContainText(formatDate(addDays(day, 2)))
    await expect(row(page, /Whitaker/)).toContainText("yesterday")
    await expect(table(page).locator('tbody tr[data-overdue="true"]')).toHaveCount(2)
    await expect(deals(page).getByText("2 overdue")).toBeVisible()
    await expect(row(page, /Treadwell/)).toContainText("$12,000")
    await expect(row(page, /Treadwell/).getByRole("button", { name: "Stage: Talking" })).toBeVisible()

    // Keyboard: Enter on the focused Add deal opens the dialog, Escape closes it.
    await deals(page).getByRole("button", { name: "Add deal", exact: true }).focus()
    await page.keyboard.press("Enter")
    await expect(dialog(page, "Add deal")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog(page, "Add deal")).toBeHidden()
    await expect(deals(page).getByRole("button", { name: "Add deal", exact: true })).toBeFocused()
  })

  test("happy path: add a deal, move its stage, finish its next step, find it under Won, survive a reload", async ({ page }) => {
    await fresh(page)
    // A visit that changes nothing writes nothing; the seed is never pinned.
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    const day = today()
    await addDeal(page, "Coach Jordan Reyes", "Westlake HS", "Staff seats × 6", "1800", "Send the quote", addDays(day, 3))
    const reyes = row(page, /Jordan Reyes/)
    await expect(reyes).toContainText("Westlake HS")
    await expect(reyes).toContainText("$1,800")
    await expect(reyes).toContainText(formatDate(addDays(day, 3)))
    await expect(reyes).toContainText("Due in 3 days")
    await expect(reyes).toContainText("today")
    // Added by the founder, so not sample data.
    await expect(reyes.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(rows(page)).toHaveCount(7)
    // Only now, after a real edit, is there a save — and the note says so.
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(resetButton(page)).toBeEnabled()
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(saved).toContain('"Coach Jordan Reyes"')
    expect(saved).not.toContain('"now')

    // Change stage inline through the pill's menu.
    await reyes.getByRole("button", { name: "Stage: Talking" }).click()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitemradio", { name: "Talking" })).toHaveAttribute("aria-checked", "true")
    await menu.getByRole("menuitemradio", { name: "Proposal" }).click()
    await expect(menu).toBeHidden()
    await expect(reyes.getByRole("button", { name: "Stage: Proposal" })).toBeVisible()

    // Mark the next step done; it asks for the new one.
    await reyes.getByRole("button", { name: "Mark next step done for Coach Jordan Reyes" }).click()
    const done = dialog(page, "Next step done")
    await expect(done).toContainText("“Send the quote” is done for Coach Jordan Reyes")
    await expect(done.getByRole("button", { name: "Save next step" })).toBeDisabled()
    await done.getByRole("textbox", { name: "New next step" }).fill("Kickoff call with their staff")
    await done.getByRole("button", { name: "Save next step" }).click()
    await expect(done).toBeHidden()
    await expect(reyes).toContainText("Kickoff call with their staff")
    await expect(reyes).toContainText("No date")

    // Won: closing the deal moves it out of Open and into Won.
    await reyes.getByRole("button", { name: "Stage: Proposal" }).click()
    await page.getByRole("menu").getByRole("menuitemradio", { name: "Closed-won" }).click()
    await expect(row(page, /Jordan Reyes/)).toHaveCount(0)
    await expect(rows(page)).toHaveCount(6)
    await filter(page, "Won").click()
    await expect(filter(page, "Won")).toHaveAttribute("aria-pressed", "true")
    await expect(deals(page).getByRole("heading", { level: 2, name: "Won" })).toBeVisible()
    await expect(rows(page)).toHaveCount(2)
    await expect(row(page, /Jordan Reyes/).getByRole("button", { name: "Stage: Closed-won" })).toBeVisible()
    await expect(row(page, /Castellano/)).toBeVisible()

    // Edit through the dialog: Save stays disabled until something changes.
    await row(page, /Castellano/).getByRole("button", { name: "Edit Coach Vince Castellano" }).click()
    const edit = dialog(page, "Edit deal")
    await expect(edit.getByRole("textbox", { name: "Who" })).toHaveValue("Coach Vince Castellano")
    await expect(edit.getByRole("textbox", { name: "Who" })).toHaveAttribute("maxlength", "60")
    await expect(edit.getByRole("button", { name: "Save changes" })).toBeDisabled()
    await edit.getByRole("textbox", { name: "Value" }).fill("4500")
    await edit.getByRole("button", { name: "Save changes" }).click()
    await expect(edit).toBeHidden()
    await expect(row(page, /Castellano/)).toContainText("$4,500")

    // Everything survives a reload; the filter is view state and resets to Open.
    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(rows(page)).toHaveCount(6)
    await filter(page, "All").click()
    await expect(rows(page)).toHaveCount(9)
    await expect(row(page, /Jordan Reyes/).getByRole("button", { name: "Stage: Closed-won" })).toBeVisible()
    await expect(row(page, /Castellano/)).toContainText("$4,500")

    // Delete asks first.
    await row(page, /Jordan Reyes/).getByRole("button", { name: "Delete Coach Jordan Reyes" }).click()
    const confirm = dialog(page, "Delete this deal?")
    await confirm.getByRole("button", { name: "Cancel" }).click()
    await expect(confirm).toBeHidden()
    await expect(row(page, /Jordan Reyes/)).toBeVisible()
    await row(page, /Jordan Reyes/).getByRole("button", { name: "Delete Coach Jordan Reyes" }).click()
    await confirm.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(row(page, /Jordan Reyes/)).toHaveCount(0)
    await expect(rows(page)).toHaveCount(8)
  })

  test("Reset is disabled until something is saved, asks first, and Keep my edits keeps them", async ({ page }) => {
    await fresh(page)
    await row(page, /Hale/).getByRole("button", { name: "Delete Coach Tommy Hale" }).click()
    await dialog(page, "Delete this deal?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(rows(page)).toHaveCount(5)
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(resetButton(page)).toBeEnabled()

    // Keep my edits: nothing changes.
    await resetButton(page).click()
    const confirm = dialog(page, "Reset demo data?")
    await expect(confirm).toContainText("regenerates the sample data from today")
    await confirm.getByRole("button", { name: "Keep my edits" }).click()
    await expect(confirm).toBeHidden()
    await expect(rows(page)).toHaveCount(5)
    await expect(note(page)).toHaveText(NOTE.saved)

    // Reset: key cleared, seed back, note unsaved, Reset disabled again.
    await resetDemoData(page)
    await expect(rows(page)).toHaveCount(6)
    await expect(row(page, /Hale/)).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(note(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
  })

  test("says so when a save fails, and never claims Saved", async ({ page }) => {
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
        return original.call(this, k, v)
      }
    }, STORAGE_KEY)
    await fresh(page)
    await row(page, /Pruitt/).getByRole("button", { name: "Stage: Verbal" }).click()
    await page.getByRole("menu").getByRole("menuitemradio", { name: "Proposal" }).click()
    await expect(row(page, /Pruitt/).getByRole("button", { name: "Stage: Proposal" })).toBeVisible()
    await expect(note(page)).toHaveText(NOTE.failed)
    await expect(screen(page).getByRole("alert")).toHaveText(NOTE.failed)
    await expect(resetButton(page)).toBeDisabled()
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test("two tabs stay in sync without ping-ponging writes, and a Reset in one re-seeds the other", async ({ context }) => {
    await countWrites(context)
    const a = await context.newPage()
    const b = await context.newPage()
    await fresh(a)
    await b.goto("/sales-opportunities")
    await expect(note(b)).toHaveText(NOTE.unsaved)
    await expect(rows(b)).toHaveCount(6)
    expect(await writes(a)).toBe(0)
    expect(await writes(b)).toBe(0)

    // Tab A edits: exactly one write, in A. B hears it and writes nothing.
    await addDeal(a, "Coach Jordan Reyes", "Westlake HS", "Staff seats × 6", "1800", "Send the quote")
    await expect(row(b, /Jordan Reyes/)).toBeVisible()
    await expect(rows(b)).toHaveCount(7)
    await expect(note(b)).toHaveText(NOTE.saved)
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(0)

    // B edits: one more write, in B. A takes it and stays quiet.
    await row(b, /Jordan Reyes/).getByRole("button", { name: "Stage: Talking" }).click()
    await b.getByRole("menu").getByRole("menuitemradio", { name: "Verbal" }).click()
    await expect(row(a, /Jordan Reyes/).getByRole("button", { name: "Stage: Verbal" })).toBeVisible()
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(1)

    // Writes have settled: nothing happens while nobody edits.
    await a.waitForTimeout(750)
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(1)

    // Reset in A: B goes back to the seed with nothing saved.
    await resetDemoData(a)
    await expect(rows(a)).toHaveCount(6)
    await expect(rows(b)).toHaveCount(6)
    await expect(row(b, /Jordan Reyes/)).toHaveCount(0)
    await expect(note(b)).toHaveText(NOTE.unsaved)
    await expect(resetButton(b)).toBeDisabled()
    await b.waitForTimeout(500)
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(1)
    expect(await a.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test("every Sample data label is solid amber at ≥ 4.5:1 on every text node, in both themes", async ({ page }) => {
    await fresh(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const region = screen(page)
      await expectReadable(region.locator("header").getByTestId("sample-data-tag"), `${theme}/header tag`, expect)
      const strip = await expectReadable(deals(page).getByTestId("sample-data-strip"), `${theme}/table strip`, expect)
      expect(strip.some((n) => /invented/.test(n.text))).toBe(true)
      // Six open seed rows, each tagged.
      const tags = table(page).getByTestId("sample-data-tag")
      await expect(tags).toHaveCount(6)
      for (const tag of await tags.all()) {
        await expect(tag).toHaveText("Sample data")
        await expectReadable(tag, `${theme}/row tag`, expect)
      }
      // The closed seed rows too.
      await filter(page, "All").click()
      await expect(table(page).getByTestId("sample-data-tag")).toHaveCount(8)
      for (const tag of await table(page).getByTestId("sample-data-tag").all()) {
        await expectReadable(tag, `${theme}/row tag (all)`, expect)
      }
      await filter(page, "Open").click()
    }
    await setTheme(page, "dark")
  })

  test("empties honestly: a filter with nothing, then no deals at all", async ({ page }) => {
    await fresh(page)
    await filter(page, "Lost").click()
    await expect(rows(page)).toHaveCount(1)
    await row(page, /Fitch/).getByRole("button", { name: "Delete Coach Aaron Fitch" }).click()
    await dialog(page, "Delete this deal?").getByRole("button", { name: "Delete", exact: true }).click()
    const empty = deals(page).getByRole("status", { name: "No deals" })
    await expect(empty).toContainText("No lost deals")
    await expect(table(page)).toHaveCount(0)

    await filter(page, "All").click()
    await expect(rows(page)).toHaveCount(7)
    for (const who of ["Pruitt", "Okafor", "Castellano", "Whitaker", "Treadwell", "Alvarez", "Hale"]) {
      await row(page, new RegExp(who)).getByRole("button", { name: /^Delete / }).click()
      await dialog(page, "Delete this deal?").getByRole("button", { name: "Delete", exact: true }).click()
    }
    await expect(empty).toContainText("No live deals")
    await expect(empty).toContainText("A hunt becomes a deal when someone is actually talking")
    await resetDemoData(page)
    await expect(rows(page)).toHaveCount(8)
  })
})
