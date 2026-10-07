import { expect, test, type BrowserContext, type Page } from "@playwright/test"

import { addDays, formatDate, now, todayIn } from "../src/lib/clock"
import { expectReadable } from "./support/contrast"
import { NOTE, resetDemoData } from "./support/persistence"

const STORAGE_KEY = "hotdash.clinics.v1"

/**
 * Today on the founder's calendar (America/Chicago), from the same helper
 * the page uses. Read per test so a run that straddles Chicago midnight
 * compares against the day the page itself rendered with.
 */
const today = () => todayIn(now())

// Every lookup below is scoped by role and name — to the sidebar, the page
// header, a named region/table, a dialog or a menu — so a sibling element
// with the same text can never match.
const rail = (page: Page) => page.locator('[data-slot="sidebar"]').first()
// A <header> inside <main> is not a banner landmark, so it is reached through
// the main landmark; everything inside it is then found by role and name.
const header = (page: Page) => page.getByRole("main").locator("header").first()
const region = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  page.getByRole("region", { name, exact: true })
const table = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  region(page, name).getByRole("table", { name, exact: true })
const bodyRows = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  table(page, name).locator("tbody").getByRole("row")
const row = (page: Page, name: "Upcoming clinics" | "Past clinics", re: RegExp) =>
  table(page, name).getByRole("row", { name: re })
const note = (page: Page) => header(page).getByTestId("persistence-note")
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add clinic", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function openMenu(page: Page, section: "Upcoming clinics" | "Past clinics", clinic: string) {
  await table(page, section).getByRole("button", { name: `Actions for ${clinic}`, exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu
}

async function freshClinics(page: Page) {
  await page.goto("/clinics")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  // Nothing edited in this browser yet, so nothing is saved — and it says so.
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toBeDisabled()
  await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await rail(page).getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

/** Fill the add/edit form. Every field is looked up by its label inside the dialog. */
async function fillClinic(
  d: ReturnType<typeof dialog>,
  values: { name?: string; date?: string; host?: string; city?: string; type?: string; leads?: string; emails?: string; demos?: string }
) {
  if (values.name !== undefined) await d.getByLabel("Name").fill(values.name)
  if (values.date !== undefined) await d.getByLabel("Date").fill(values.date)
  if (values.host !== undefined) await d.getByLabel("Host").fill(values.host)
  if (values.city !== undefined) await d.getByLabel("City").fill(values.city)
  if (values.type !== undefined) await d.getByRole("group", { name: "Type" }).getByRole("button", { name: values.type, exact: true }).click()
  if (values.leads !== undefined) await d.getByLabel("Leads").fill(values.leads)
  if (values.emails !== undefined) await d.getByLabel("Emails").fill(values.emails)
  if (values.demos !== undefined) await d.getByLabel("Demos").fill(values.demos)
}

/**
 * Count writes to our key from inside the page, so a two-tab run can prove
 * the stores settle instead of trading saves. Installed before any script
 * on every page of the context.
 */
async function countWrites(context: BrowserContext, key: string) {
  await context.addInitScript((k) => {
    const w = window as unknown as { __writes: number }
    w.__writes = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === k) w.__writes += 1
      return original.call(this, name, value)
    }
  }, key)
}
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __writes: number }).__writes)

test.describe("Clinics", () => {
  test("is reachable from the sidebar and shows the mock's two sections", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "Clinics", exact: true }).click()
    await expect(page).toHaveURL(/\/clinics$/)
    await expect(header(page).getByRole("heading", { level: 1, name: "Clinics" })).toBeVisible()
    await expect(header(page).getByText("Where the founder talks CHLK")).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "Clinics", exact: true })).toHaveAttribute("data-active")

    for (const name of ["Upcoming clinics", "Past clinics"] as const) {
      await expect(region(page, name)).toBeVisible()
      await expect(table(page, name).getByRole("columnheader")).toHaveText([
        "Name", "Date", "City", "Type", "Attend", "Collected", "Owner", "Status", "Actions",
      ])
      await expect(bodyRows(page, name)).toHaveCount(4)
      await expect(region(page, name).getByTestId("section-count")).toHaveText("4")
    }

    // Real clock: the seed sits around today's Central date, so the first
    // upcoming row is 15 days out and the first past row 81 days back.
    const day = today()
    const first = row(page, "Upcoming clinics", /Houston Offensive Staff Clinic/)
    await expect(first).toContainText(formatDate(addDays(day, 15)))
    await expect(first).toContainText("in 15 days")
    await expect(first.getByTestId("status-pill")).toHaveText("Upcoming")
    await expect(first.getByTestId("type-pill")).toHaveText("Clinic")
    const past = row(page, "Past clinics", /Spring Houston walk-through/)
    await expect(past).toContainText(formatDate(addDays(day, -81)))
    await expect(past).toContainText("81 days ago")
    await expect(past).toContainText("14 leads · 11 emails · 3 demos")
    await expect(past.getByTestId("status-pill")).toHaveText("Done")
    await expect(row(page, "Upcoming clinics", /Midweek CHLK walkthrough/).getByTestId("type-pill")).toHaveText("Zoom")
  })

  test("labels every seed row as sample data, readable at ≥ 4.5:1 on every text node, light and dark; status pills too", async ({ page }) => {
    await freshClinics(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(header(page).getByTestId("sample-data-tag"), `${theme}/header tag`, expect)
      for (const name of ["Upcoming clinics", "Past clinics"] as const) {
        const tags = table(page, name).getByTestId("sample-data-tag")
        await expect(tags).toHaveCount(4)
        for (const tag of await tags.all()) {
          await expect(tag).toHaveText("Sample data")
          await expectReadable(tag, `${theme}/${name} row tag`, expect)
        }
        for (const pill of await table(page, name).getByTestId("status-pill").all()) {
          await expectReadable(pill, `${theme}/${name} status`, expect)
        }
        for (const pill of await table(page, name).getByTestId("type-pill").all()) {
          await expectReadable(pill, `${theme}/${name} type`, expect)
        }
      }
    }
    await setTheme(page, "light")
  })

  test("happy path: add → edit the date into the past → mark attended → record collected → survives reload → Reset via confirm", async ({ page }) => {
    await freshClinics(page)
    // A visit that changes nothing writes nothing; the seed is never pinned.
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    const day = today()

    // Add, dated three days out: lands in Upcoming, first by date.
    await addButton(page).click()
    const add = dialog(page, "Add clinic")
    await expect(add.getByLabel("Name")).toBeFocused()
    await expect(add.getByLabel("Date")).toHaveValue(day)
    await expect(add.getByLabel("Owner")).toHaveValue("Trip")
    await expect(add.getByRole("button", { name: "Add clinic", exact: true })).toBeDisabled()
    await fillClinic(add, { name: "Katy spring install", host: "Katy ISD athletics", city: "Katy", type: "Staff meeting", date: addDays(day, 3) })
    // The founder's "Soon" button, disabled but titled.
    const spawn = add.getByRole("button", { name: "Spawn Sales Opportunity", exact: true })
    await expect(spawn).toBeDisabled()
    await expect(spawn).toHaveAttribute("title", "Soon — creates a deal on Sales Opportunities")
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    await expect(add).toBeHidden()

    const upcoming = row(page, "Upcoming clinics", /Katy spring install/)
    await expect(upcoming).toBeVisible()
    await expect(bodyRows(page, "Upcoming clinics").first()).toContainText("Katy spring install")
    await expect(upcoming).toContainText("in 3 days")
    await expect(upcoming.getByTestId("type-pill")).toHaveText("Staff meeting")
    await expect(upcoming.getByTestId("status-pill")).toHaveText("Upcoming")
    await expect(upcoming.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(region(page, "Upcoming clinics").getByTestId("section-count")).toHaveText("5")
    // Only now, after a real edit, is there a save — and the note says so.
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(resetButton(page)).toBeEnabled()

    // Edit the date to yesterday: it moves to Past, unconfirmed.
    let menu = await openMenu(page, "Upcoming clinics", "Katy spring install")
    await menu.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const edit = dialog(page, "Edit clinic")
    await expect(edit.getByLabel("Name")).toHaveValue("Katy spring install")
    await fillClinic(edit, { date: addDays(day, -1) })
    await edit.getByRole("button", { name: "Save changes", exact: true }).click()
    await expect(edit).toBeHidden()
    await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)
    const past = row(page, "Past clinics", /Katy spring install/)
    await expect(past).toBeVisible()
    await expect(bodyRows(page, "Past clinics").first()).toContainText("Katy spring install")
    await expect(past).toContainText("Yesterday")
    await expect(past.getByTestId("status-pill")).toHaveText("Unconfirmed")
    await expect(past.getByTestId("attendance")).toHaveText("Planned")
    await expect(past).toContainText("Nothing yet")

    // Mark attended.
    menu = await openMenu(page, "Past clinics", "Katy spring install")
    await menu.getByRole("menuitem", { name: "Mark attended", exact: true }).click()
    await expect(past.getByTestId("attendance")).toHaveText("Attended")
    await expect(past.getByTestId("status-pill")).toHaveText("Done")

    // Record what we collected: the dialog opens on Leads.
    menu = await openMenu(page, "Past clinics", "Katy spring install")
    await menu.getByRole("menuitem", { name: "Record collected", exact: true }).click()
    const record = dialog(page, "Edit clinic")
    await expect(record.getByLabel("Leads")).toBeFocused()
    await fillClinic(record, { leads: "12", emails: "9", demos: "2" })
    await record.getByRole("button", { name: "Save changes", exact: true }).click()
    await expect(record).toBeHidden()
    await expect(past).toContainText("12 leads · 9 emails · 2 demos")

    // Reload: the saved copy comes back whole.
    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    const reloaded = row(page, "Past clinics", /Katy spring install/)
    await expect(reloaded).toContainText("12 leads · 9 emails · 2 demos")
    await expect(reloaded.getByTestId("status-pill")).toHaveText("Done")
    await expect(bodyRows(page, "Past clinics")).toHaveCount(5)
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(saved).toContain('"Katy spring install"')
    expect(saved).not.toContain('"now"')

    // Reset asks first; "Keep my edits" keeps them.
    await resetButton(page).click()
    const confirm = dialog(page, "Reset demo data?")
    await confirm.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(row(page, "Past clinics", /Katy spring install/)).toBeVisible()

    // Reset (through the shared helper's confirm) clears the key and puts the seed back.
    await resetDemoData(page)
    await expect(bodyRows(page, "Past clinics")).toHaveCount(4)
    await expect(table(page, "Past clinics").getByText("Katy spring install")).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(note(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
  })

  test("delete asks first, and emptying the list shows one empty state", async ({ page }) => {
    await freshClinics(page)
    let menu = await openMenu(page, "Upcoming clinics", "Dallas 7-on-7 Coaches Night")
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
    const confirm = dialog(page, "Delete this clinic?")
    await expect(confirm).toContainText("Dallas 7-on-7 Coaches Night")
    await confirm.getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)

    const names = [
      ["Upcoming clinics", "Houston Offensive Staff Clinic"],
      ["Upcoming clinics", "Dallas 7-on-7 Coaches Night"],
      ["Upcoming clinics", "Midweek CHLK walkthrough"],
      ["Upcoming clinics", "Austin staff install"],
      ["Past clinics", "Spring Houston walk-through"],
      ["Past clinics", "Dallas staff huddle"],
      ["Past clinics", "Remote playbook office hours"],
      ["Past clinics", "Fort Worth spring clinic"],
    ] as const
    for (const [section, name] of names) {
      menu = await openMenu(page, section, name)
      await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
      await dialog(page, "Delete this clinic?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(dialog(page, "Delete this clinic?")).toBeHidden()
      // An empty section says so before the whole list is gone.
      if (name === "Austin staff install") {
        await expect(table(page, "Upcoming clinics").getByRole("status")).toHaveText("Nothing on the calendar. Add a clinic above.")
      }
    }
    const empty = page.getByRole("status", { name: "No clinics", exact: true })
    await expect(empty).toContainText("No clinics on the calendar")
    await expect(region(page, "Upcoming clinics")).toHaveCount(0)

    // The empty state can add, and the counter carried on past the seed ids.
    await empty.getByRole("button", { name: "Add clinic", exact: true }).click()
    const add = dialog(page, "Add clinic")
    await fillClinic(add, { name: "First one back" })
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    await expect(add).toBeHidden()
    const back = row(page, "Upcoming clinics", /First one back/)
    await expect(back).toContainText("Today")
    await expect(back).toHaveAttribute("data-clinic", "clinic-9")

    await resetDemoData(page)
    await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)
  })

  test("the whole screen works from the keyboard: Add via Tab/Enter, a row menu via arrows", async ({ page }) => {
    await freshClinics(page)
    const day = today()

    // From the heading, Tab reaches Add clinic without detours. (A click on
    // the non-focusable h1 sets the sequential-focus start point; focus()
    // on it would be a no-op and the walk would start at the sidebar.)
    await header(page).getByRole("heading", { level: 1, name: "Clinics" }).click()
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab")
      const label = await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label") ?? el.textContent?.trim()}` : "none"
      })
      seen.push(label)
      if (label === "button:Add clinic") break
    }
    expect(seen.at(-1), seen.join(" | ")).toBe("button:Add clinic")
    // The disabled Reset is not a stop, and the header has no hidden traps.
    expect(seen.some((s) => s.startsWith("button:Reset"))).toBe(false)

    await page.keyboard.press("Enter")
    const add = dialog(page, "Add clinic")
    await expect(add.getByLabel("Name")).toBeFocused()
    await page.keyboard.type("Keyboard clinic")
    // Tab through to the Date field and type a past date.
    await page.keyboard.press("Tab")
    await expect(add.getByLabel("Date")).toBeFocused()
    await add.getByLabel("Date").fill(addDays(day, -2))
    // Enter submits the form from a text field.
    await add.getByLabel("Host").focus()
    await page.keyboard.press("Enter")
    await expect(add).toBeHidden()
    const r = row(page, "Past clinics", /Keyboard clinic/)
    await expect(r).toBeVisible()

    // The row menu: focus the trigger, open with Enter, arrow to Mark attended.
    const trigger = table(page, "Past clinics").getByRole("button", { name: "Actions for Keyboard clinic", exact: true })
    await trigger.focus()
    await page.keyboard.press("Enter")
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Edit", exact: true })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await expect(menu.getByRole("menuitem", { name: "Mark attended", exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(menu).toBeHidden()
    await expect(r.getByTestId("status-pill")).toHaveText("Done")
    // Focus returns to the row's trigger.
    await expect(trigger).toBeFocused()

    // Delete from the keyboard too: open, End for the last item, Enter, confirm.
    await page.keyboard.press("Enter")
    await expect(menu).toBeVisible()
    await page.keyboard.press("End")
    await expect(menu.getByRole("menuitem", { name: "Delete", exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    const confirm = dialog(page, "Delete this clinic?")
    await expect(confirm).toBeVisible()
    await confirm.getByRole("button", { name: "Delete", exact: true }).focus()
    await page.keyboard.press("Enter")
    await expect(confirm).toBeHidden()
    await expect(table(page, "Past clinics").getByText("Keyboard clinic")).toHaveCount(0)

    await resetDemoData(page)
  })

  test("a save that fails is announced, never claimed, and Reset stays disabled", async ({ browser }) => {
    const context = await browser.newContext()
    await context.addInitScript((k) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (name: string, value: string) {
        if (name === k) throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
        return original.call(this, name, value)
      }
    }, STORAGE_KEY)
    const page = await context.newPage()
    await page.goto("/clinics")
    await expect(note(page)).toHaveText(NOTE.unsaved)

    const menu = await openMenu(page, "Upcoming clinics", "Austin staff install")
    await menu.getByRole("menuitem", { name: "Mark skipped", exact: true }).click()
    // The edit took in memory…
    await expect(row(page, "Upcoming clinics", /Austin staff install/).getByTestId("attendance")).toHaveText("Skipped")
    // …but the note says it could not be kept, as an alert, and Reset has nothing to reset.
    const alert = header(page).getByRole("alert")
    await expect(alert).toHaveText(NOTE.failed)
    await expect(note(page)).not.toContainText("Saved")
    await expect(resetButton(page)).toBeDisabled()
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await context.close()
  })

  test("two tabs stay in sync and the writes settle: one per edit, none for a hydrate", async ({ browser }) => {
    const context = await browser.newContext()
    await countWrites(context, STORAGE_KEY)
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto("/clinics")
    await a.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await a.reload()
    await b.goto("/clinics")
    await expect(note(a)).toHaveText(NOTE.unsaved)
    await expect(note(b)).toHaveText(NOTE.unsaved)
    expect(await writes(a)).toBe(0)
    expect(await writes(b)).toBe(0)

    // Edit in A: one write in A; B hydrates and writes nothing.
    let menu = await openMenu(a, "Upcoming clinics", "Houston Offensive Staff Clinic")
    await menu.getByRole("menuitem", { name: "Mark skipped", exact: true }).click()
    await expect(row(b, "Upcoming clinics", /Houston Offensive Staff Clinic/).getByTestId("attendance")).toHaveText("Skipped")
    await expect(note(b)).toHaveText(NOTE.saved)
    await expect(resetButton(b)).toBeEnabled()
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(0)

    // Edit in B: one write in B; A hydrates and writes nothing. Totals settle.
    menu = await openMenu(b, "Upcoming clinics", "Dallas 7-on-7 Coaches Night")
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await dialog(b, "Delete this clinic?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(bodyRows(a, "Upcoming clinics")).toHaveCount(3)
    await expect(table(a, "Upcoming clinics").getByText("Dallas 7-on-7 Coaches Night")).toHaveCount(0)
    // Give any echo a moment to show itself, then assert there was none.
    await a.waitForTimeout(500)
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(1)

    // Reset in A (behind its confirm): B hears the clear and re-seeds, with nothing to reset.
    await resetDemoData(a)
    await expect(bodyRows(b, "Upcoming clinics")).toHaveCount(4)
    await expect(row(b, "Upcoming clinics", /Houston Offensive Staff Clinic/).getByTestId("attendance")).toHaveText("Planned")
    await expect(note(b)).toHaveText(NOTE.unsaved)
    await expect(resetButton(b)).toBeDisabled()
    await b.waitForTimeout(500)
    expect(await writes(a)).toBe(1)
    expect(await writes(b)).toBe(1)
    expect(await a.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await context.close()
  })

  test("a corrupt saved copy is parked under <key>.rejected and the seed renders", async ({ page }) => {
    await page.goto("/clinics")
    await page.evaluate((key) => localStorage.setItem(key, '{"clinics":[{"id":"clinic-1","type":"webinar"}],"nextId":2}'), STORAGE_KEY)
    await page.reload()
    await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)
    await expect(note(page)).toHaveText(NOTE.unsaved)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    expect(await page.evaluate((key) => localStorage.getItem(`${key}.rejected`), STORAGE_KEY)).toContain('"webinar"')
    await page.evaluate((key) => localStorage.removeItem(`${key}.rejected`), STORAGE_KEY)
  })
})
