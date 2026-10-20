import { expect, test, type Locator, type Page } from "@playwright/test"

import { addDays, formatDate, now, todayIn } from "../src/lib/clock"
import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { founderClinicsState } from "../src/lib/clinics-fixture"
import { NOTE, clearMyEntries, countWrites, expectWritesSettled, persistenceNote, storeFounderCopy, writesTo } from "./support/persistence"
import { setTheme } from "./support/theme"

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
const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
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
const note = (page: Page, opts?: { failed?: boolean }) => persistenceNote(page, opts)
const clearButton = (page: Page) => header(page).getByRole("button", { name: "Clear my entries", exact: true })
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add clinic", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function openMenu(page: Page, section: "Upcoming clinics" | "Past clinics", clinic: string) {
  await table(page, section).getByRole("button", { name: `Actions for ${clinic}`, exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu
}

const emptyState = (page: Page) => page.getByRole("status", { name: "No clinics", exact: true })

/** A fresh browser: no sample clinics, nothing saved, nothing to clear. */
async function freshClinics(page: Page) {
  await page.goto("/clinics")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(emptyState(page)).toContainText("No clinics on the calendar")
}

/** The founder's own clinics (a test-only copy of the old sample, ids past it), stored before the page loads. */
async function founderClinics(page: Page, path = "/clinics") {
  await storeFounderCopy(page, STORAGE_KEY, founderClinicsState(today()))
  await page.goto(path)
}

async function withFounder(page: Page) {
  await founderClinics(page)
  await expect(note(page)).toHaveText(NOTE.saved)
  await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)
}

/**
 * WCAG contrast between the painted backgrounds of two controls (pressed
 * vs unpressed). Composites translucent fills onto the nearest opaque
 * ancestor so outline toggles are measured honestly.
 */
async function backgroundContrast(a: Locator, b: Locator) {
  return a.evaluate((elA, elB) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
    const parse = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, bb, alpha] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b: bb, a: alpha / 255 }
    }
    const over = (top: { r: number; g: number; b: number; a: number }, under: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
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

test.describe("Clinics", () => {
  test("is reachable from the sidebar and shows the founder's clinics in two sections", async ({ page }) => {
    await founderClinics(page, "/home")
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

    // Real clock: the founder's copy sits around today's Central date, so the first
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

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await withFounder(page)
    // One shared probe for every screen; if it stopped seeing unreadable
    // text, every contrast assertion below would pass vacuously.
    const first = row(page, "Upcoming clinics", /Houston Offensive Staff Clinic/)
    await expectProbeCatchesSabotage(first.getByTestId("status-pill"), "status pill", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(
      row(page, "Past clinics", /Spring Houston walk-through/).getByTestId("status-pill"),
      "status pill (dark)",
      expect
    )
    await setTheme(page, "light")
  })

  test("no Sample data tag anywhere; status and type pills read at ≥ 4.5:1, light and dark", async ({ page }) => {
    await withFounder(page)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      for (const name of ["Upcoming clinics", "Past clinics"] as const) {
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

  test("Add clinic Type and attendance pressed options read at ≥ 3:1 vs unpressed, light and dark", async ({ page }) => {
    await freshClinics(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await addButton(page).click()
      const add = dialog(page, "Add clinic")
      await expect(add).toBeVisible()
      for (const name of ["Type", "Do we show up?"] as const) {
        const group = add.getByRole("group", { name, exact: true })
        const pressed = group.getByRole("button", { pressed: true })
        const unpressed = group.getByRole("button", { pressed: false }).first()
        await expect(pressed).toBeVisible()
        const ratio = await backgroundContrast(pressed, unpressed)
        expect(ratio, `${theme}/${name} pressed vs unpressed ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
        await expectReadable(pressed, `${theme}/${name} pressed`, expect)
      }
      await page.keyboard.press("Escape")
      await expect(add).toBeHidden()
    }
    await setTheme(page, "light")
  })

  test("the disabled Clear my entries does not react to hover and keeps its own size", async ({ page }) => {
    await freshClinics(page)
    const reset = clearButton(page)
    await expect(reset).toHaveAttribute("aria-disabled", "true")
    const styles = () =>
      reset.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { background: cs.backgroundColor, color: cs.color, fontSize: cs.fontSize, paddingLeft: cs.paddingLeft, cursor: cs.cursor, opacity: cs.opacity }
      })
    const before = await styles()
    expect(before.fontSize).toBe("11px") // text-micro, not Nova's text-xs (12px)
    expect(before.paddingLeft).toBe("6px") // px-1.5, not Nova's px-2
    expect(before.cursor).toBe("not-allowed")
    expect(Number(before.opacity)).toBeCloseTo(0.5, 2)
    await reset.hover()
    await page.mouse.move(1, 1)
    await reset.hover()
    const during = await styles()
    expect(during.background).toBe(before.background)
    expect(during.color).toBe(before.color)
    expect(during.fontSize).toBe("11px")
  })

  test("happy path: add → edit the date into the past → mark attended → record collected → survives reload → Clear via confirm", async ({ page }) => {
    await withFounder(page)
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
    await expect(region(page, "Upcoming clinics").getByTestId("section-count")).toHaveText("5")
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(clearButton(page)).toBeEnabled()

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

    // Clear asks first; "Keep my edits" keeps them.
    await clearButton(page).click()
    const confirm = dialog(page, "Clear my entries?")
    await confirm.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(row(page, "Past clinics", /Katy spring install/)).toBeVisible()

    // Clear (through the shared helper's confirm) removes the key; no sample comes back.
    await clearMyEntries(page, header(page))
    await expect(emptyState(page)).toBeVisible()
    await expect(page.getByText("Katy spring install")).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(note(page)).toHaveText(NOTE.unsaved)
    await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
  })

  test("delete asks first, and emptying the list shows one empty state", async ({ page }) => {
    await withFounder(page)
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
    const empty = emptyState(page)
    await expect(empty).toContainText("No clinics on the calendar")
    await expect(region(page, "Upcoming clinics")).toHaveCount(0)

    // The empty state can add, and the counter carried on past the founder's ids.
    await empty.getByRole("button", { name: "Add clinic", exact: true }).click()
    const add = dialog(page, "Add clinic")
    await fillClinic(add, { name: "First one back" })
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    await expect(add).toBeHidden()
    const back = row(page, "Upcoming clinics", /First one back/)
    await expect(back).toContainText("Today")
    await expect(back).toHaveAttribute("data-clinic", "clinic-109")

    await clearMyEntries(page, header(page))
    await expect(emptyState(page)).toBeVisible()
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
    // The disabled Clear is a stop on purpose (focusable, with the shared
    // hint as its description), and nothing else sits between the h1 and Add.
    expect(seen, seen.join(" | ")).toEqual(["button:Clear my entries", "button:Add clinic"])
    await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
    await expect(clearButton(page)).toHaveAccessibleDescription(/nothing to clear/)

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
    await expect(page.getByText("Keyboard clinic")).toHaveCount(0)

    await clearMyEntries(page, header(page))
  })

  test("a save that fails is announced, never claimed, and Clear stays disabled", async ({ browser }) => {
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

    await addButton(page).click()
    const add = dialog(page, "Add clinic")
    await fillClinic(add, { name: "Unsaved clinic", date: addDays(today(), 2) })
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    // The edit took in memory…
    await expect(row(page, "Upcoming clinics", /Unsaved clinic/)).toBeVisible()
    // …but the note says it could not be kept, as an alert, and Clear has nothing to clear.
    await expect(note(page, { failed: true })).toHaveText(NOTE.failed)
    await expect(note(page, { failed: true })).not.toContainText("Saved")
    await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
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
    // Writes are counted after the other tab has visibly taken the change
    // (web-first), then must stay flat over a quiet window: a loop would
    // move the count and the poll would never settle.
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)
    await settled(a, 0)
    await settled(b, 0)

    // Edit in A (add a clinic): one write in A; B hydrates and writes nothing.
    await addButton(a).click()
    const add = dialog(a, "Add clinic")
    await fillClinic(add, { name: "Two-tab clinic", date: addDays(today(), 4) })
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    await expect(row(b, "Upcoming clinics", /Two-tab clinic/)).toBeVisible()
    await expect(note(b)).toHaveText(NOTE.saved)
    await expect(clearButton(b)).toBeEnabled()
    await settled(a, 1)
    await settled(b, 0)

    // Edit in B: one write in B; A hydrates and writes nothing. Totals settle.
    const menu = await openMenu(b, "Upcoming clinics", "Two-tab clinic")
    await menu.getByRole("menuitem", { name: "Mark skipped", exact: true }).click()
    await expect(row(a, "Upcoming clinics", /Two-tab clinic/).getByTestId("attendance")).toHaveText("Skipped")
    await settled(a, 1)
    await settled(b, 1)

    // Clear in A (behind its confirm): B hears it and empties, with nothing to clear.
    await clearMyEntries(a, header(a))
    await expect(emptyState(b)).toBeVisible()
    await expect(note(b)).toHaveText(NOTE.unsaved)
    await expect(clearButton(b)).toHaveAttribute("aria-disabled", "true")
    await settled(a, 1)
    await settled(b, 1)
    expect(await a.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await context.close()
  })

  test("a corrupt saved copy renders the empty list without being touched; the first real save parks it under <key>.rejected", async ({ browser }) => {
    const context = await browser.newContext()
    await countWrites(context, STORAGE_KEY)
    const page = await context.newPage()
    const junk = '{"clinics":[{"id":"clinic-1","type":"webinar"}],"nextId":2}'
    await page.goto("/clinics")
    await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [STORAGE_KEY, junk] as const)
    await page.reload()
    await expect(emptyState(page)).toBeVisible()
    await expect(note(page)).toHaveText(NOTE.unsaved)
    // load() is pure: the bad copy is still there, nothing was written, nothing parked yet.
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(junk)
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)
    expect(await page.evaluate((key) => localStorage.getItem(`${key}.rejected`), STORAGE_KEY)).toBeNull()

    // The first real edit parks it — as the helper's `{ at, raw, why }[]` — and writes ours.
    await addButton(page).click()
    const add = dialog(page, "Add clinic")
    await fillClinic(add, { name: "After the junk", date: addDays(today(), 2) })
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    await expect(note(page)).toHaveText(NOTE.saved)
    const parked = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(`${key}.rejected`) ?? "[]") as { raw: string; why: string }[],
      STORAGE_KEY
    )
    expect(parked).toHaveLength(1)
    expect(parked[0].why).toBe("failed validation")
    expect(parked[0].raw).toBe(junk)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('"After the junk"')
    await context.close()
  })
})
