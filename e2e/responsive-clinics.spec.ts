import { expect, test, type Locator, type Page } from "@playwright/test"

import { ROW_COLLAPSE_SLOT } from "../src/components/responsive-table"
import { expectReadable } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

const STORAGE_KEY = "hotdash.clinics.v1"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const header = (page: Page) => page.getByRole("main").locator("header").first()
const region = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  page.getByRole("region", { name, exact: true })
const table = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  region(page, name).getByRole("table", { name, exact: true })
const cards = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  region(page, name).locator(`[data-slot='${ROW_COLLAPSE_SLOT}']:visible`)
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add clinic", exact: true })
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

const TYPE_ATTEND = ["Clinic", "Zoom", "Staff meeting", "Planned", "Attended", "Skipped"] as const

async function freshClinics(page: Page) {
  await page.goto("/clinics")
  await waitForHydration(page)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

async function expectMinHit(locator: Locator, label: string, min = 44) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, label).toBeTruthy()
  // Subpixel paint (43.999) still clears a 44px token.
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(min - 0.5)
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(min - 0.5)
}

async function expectNoPageOverflowX(page: Page) {
  expect(await pageOverflowX(page), `horizontal overflow`).toBeLessThanOrEqual(1)
}

async function expectNoTableScrollX(tbl: Locator, label: string) {
  const extra = await tbl.evaluate((el) => {
    const scroller = el.closest("[data-slot='table-container']") ?? el
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(extra, `${label} table horizontal scroll ${extra}px`).toBeLessThanOrEqual(1)
}

async function expectFullyInside(inner: Locator, outer: Locator, label: string) {
  const [i, o] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
  expect(i, label).toBeTruthy()
  expect(o, `${label} container`).toBeTruthy()
  expect(i!.x, `${label} left`).toBeGreaterThanOrEqual(o!.x - 1)
  expect(i!.y, `${label} top`).toBeGreaterThanOrEqual(o!.y - 1)
  expect(i!.x + i!.width, `${label} right`).toBeLessThanOrEqual(o!.x + o!.width + 1)
  expect(i!.y + i!.height, `${label} bottom`).toBeLessThanOrEqual(o!.y + o!.height + 1)
}

async function expectFullyInViewport(locator: Locator, label: string) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const vp = locator.page().viewportSize()
  expect(box, label).toBeTruthy()
  expect(vp, `${label} viewport`).toBeTruthy()
  expect(box!.x, `${label} left`).toBeGreaterThanOrEqual(-1)
  expect(box!.y, `${label} top`).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width, `${label} right`).toBeLessThanOrEqual(vp!.width + 1)
  expect(box!.y + box!.height, `${label} bottom`).toBeLessThanOrEqual(vp!.height + 1)
}

async function expectUnclippedText(locator: Locator, label: string) {
  const extra = await locator.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(extra, `${label} text clip ${extra}px`).toBeLessThanOrEqual(1)
}

function tableCard(page: Page, name: "Upcoming clinics" | "Past clinics") {
  return region(page, name).locator("[data-slot='responsive-table']")
}

async function expectTabletTableFits(page: Page, name: "Upcoming clinics" | "Past clinics") {
  const tbl = table(page, name)
  const card = tableCard(page, name)
  await expectNoTableScrollX(tbl, name)
  const houstonOrFirst = tbl.locator("tbody tr").first()
  const status = houstonOrFirst.getByTestId("status-pill")
  await expect(status).toBeVisible()
  await expectUnclippedText(status, `${name} status`)
  await expectFullyInside(status, card, `${name} status`)
  const menu = houstonOrFirst.getByRole("button", { name: /Actions for / })
  await expect(menu).toBeVisible()
  await expectFullyInside(menu, card, `${name} row menu`)
}

async function visibleHeaders(tbl: Locator) {
  return tbl.getByRole("columnheader").evaluateAll((els) =>
    els.map((el) => el.textContent?.trim() ?? "").filter((t) => t && t !== "Actions")
  )
}

async function expectNotesUnclipped(form: Locator, label: string) {
  const notes = form.getByLabel("Notes")
  await notes.scrollIntoViewIfNeeded()
  const extra = await notes.evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(extra, `${label} notes clip ${extra}px`).toBeLessThanOrEqual(1)
}

async function expectFormTouch(form: Locator, label: string) {
  await expectMinHit(form.getByRole("button", { name: /Save changes|Add clinic/, exact: true }), `${label} Save`)
  await expectMinHit(form.getByRole("button", { name: "Staff meeting", exact: true }), `${label} Staff meeting`)
  await expectMinHit(form.getByRole("button", { name: "Planned", exact: true }), `${label} Planned`)
  await expectMinHit(form.getByLabel("Name"), `${label} Name`)
  await expectMinHit(form.getByRole("button", { name: "Close", exact: true }), `${label} close`)
}

async function expectClinicsReadable(page: Page, theme: "light" | "dark") {
  await expectReadable(header(page).getByRole("heading", { level: 1 }), `${theme}/h1`, expect)
  await expectReadable(header(page).getByTestId("sample-data-tag"), `${theme}/header tag`, expect)
  const card = cards(page, "Upcoming clinics").first()
  if ((await card.count()) > 0) {
    await expectReadable(card, `${theme}/upcoming card`, expect)
  }
  const surface = cards(page, "Upcoming clinics").or(table(page, "Upcoming clinics"))
  await expectReadable(surface.getByTestId("status-pill").first(), `${theme}/upcoming status`, expect)
  await expectReadable(surface.getByTestId("sample-data-tag").first(), `${theme}/upcoming sample`, expect)
}

test.describe("responsive Clinics (phone 390)", () => {
  test.use({ viewport: SIZES.phone })

  test("records are cards, no table, no overflow, 44px Add, readable light and dark", async ({
    page,
  }) => {
    await freshClinics(page)
    await expect(cards(page, "Upcoming clinics")).toHaveCount(4)
    await expect(cards(page, "Past clinics")).toHaveCount(4)
    await expect(table(page, "Upcoming clinics")).toHaveCount(0)
    await expectMinHit(addButton(page), "phone Add clinic")
    await expectMinHit(resetButton(page), "phone Reset")
    await expectMinHit(cards(page, "Upcoming clinics").first(), "phone card")
    await expectNoPageOverflowX(page)

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectClinicsReadable(page, theme)
    }
    await setTheme(page, "light")
  })

  test("a card opens the existing edit form as a bottom sheet", async ({ page }) => {
    await freshClinics(page)
    await cards(page, "Upcoming clinics").first().click()
    const edit = dialog(page, "Edit clinic")
    await expect(edit).toBeVisible()
    await expect(edit).toHaveAttribute("data-side", "bottom")
    await expect(edit.getByLabel("Name")).toHaveValue("Houston Offensive Staff Clinic")
    await expectMinHit(edit.getByRole("button", { name: "Close", exact: true }), "sheet close")
    await expectMinHit(edit.getByRole("button", { name: "Cancel", exact: true }), "sheet Cancel")
    await expectFormTouch(edit, "phone sheet")
    await expectNotesUnclipped(edit, "phone sheet")
    await expectReadable(edit.getByRole("heading", { name: "Edit clinic" }), "phone/edit sheet title", expect)
    await expectReadable(edit.getByText(/Dates are calendar days/), "phone/edit sheet copy", expect)
    await expectNoPageOverflowX(page)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()

    // Sheet covers the phone theme control — close, switch, reopen to measure.
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await cards(page, "Upcoming clinics").first().click()
      await expect(edit).toBeVisible()
      await expectReadable(
        edit.getByRole("button", { name: "Delete clinic", exact: true }),
        `${theme}/Delete clinic`,
        expect
      )
      await page.keyboard.press("Escape")
      await expect(edit).toBeHidden()
    }
    await setTheme(page, "light")
  })

  test("Type and attendance options are fully visible in the phone sheet", async ({ page }) => {
    await freshClinics(page)
    await cards(page, "Upcoming clinics").first().click()
    const edit = dialog(page, "Edit clinic")
    await expect(edit).toBeVisible()
    for (const name of TYPE_ATTEND) {
      const option = edit.getByRole("button", { name, exact: true })
      await expect(option).toBeVisible()
      await expectFullyInViewport(option, `phone ${name}`)
    }
  })

  test("Delete clinic in the phone sheet removes the row and returns focus", async ({ page }) => {
    await freshClinics(page)
    const first = cards(page, "Upcoming clinics").first()
    await first.click()
    const edit = dialog(page, "Edit clinic")
    const remove = edit.getByRole("button", { name: "Delete clinic", exact: true })
    await expect(remove).toBeVisible()
    await expectMinHit(remove, "phone Delete clinic")
    await remove.click()
    const confirm = dialog(page, "Delete this clinic?")
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText("Houston Offensive Staff Clinic")
    await expectMinHit(confirm.getByRole("button", { name: "Delete", exact: true }), "phone delete-confirm")
    await expectReadable(confirm.getByRole("heading", { name: "Delete this clinic?" }), "phone/delete title", expect)
    await confirm.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText("Houston Offensive Staff Clinic")).toHaveCount(0)
    await expect(cards(page, "Upcoming clinics")).toHaveCount(3)
    await expect(page.getByRole("heading", { level: 1, name: "Clinics" })).toBeFocused()
  })

  test("empty state Add is 44px and does not overflow", async ({ page }) => {
    await page.goto("/clinics")
    await waitForHydration(page)
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ clinics: [], nextId: 9 })), STORAGE_KEY)
    await page.reload()
    await waitForHydration(page)
    const empty = page.getByRole("status", { name: "No clinics", exact: true })
    await expect(empty).toBeVisible()
    await expectMinHit(empty.getByRole("button", { name: "Add clinic", exact: true }), "empty Add clinic")
    await expectNoPageOverflowX(page)
  })
})

test.describe("responsive Clinics (tablet portrait 820)", () => {
  test.use({ viewport: SIZES["tablet-portrait"] })

  test("keeps tables of ≤5 data columns, 44px targets, no overflow", async ({ page }) => {
    await freshClinics(page)
    await expect(table(page, "Upcoming clinics")).toBeVisible()
    await expect(cards(page, "Upcoming clinics")).toHaveCount(0)
    expect(await visibleHeaders(table(page, "Upcoming clinics"))).toEqual([
      "Name",
      "Date",
      "Type",
      "Owner",
      "Status",
    ])
    expect(await visibleHeaders(table(page, "Past clinics"))).toEqual([
      "Name",
      "Date",
      "Collected",
      "Status",
    ])
    await expectMinHit(addButton(page), "tablet Add clinic")
    await expectMinHit(resetButton(page), "tablet Reset")
    const menu = table(page, "Upcoming clinics").getByRole("button", {
      name: "Actions for Houston Offensive Staff Clinic",
      exact: true,
    })
    await expectMinHit(menu, "tablet row menu")
    await expect(menu).toHaveCSS("opacity", "1")
    await expect(
      table(page, "Upcoming clinics").getByRole("row", { name: /Houston Offensive/ })
    ).toContainText("in 15 days · Houston")
    await expectTabletTableFits(page, "Upcoming clinics")
    await expectTabletTableFits(page, "Past clinics")
    await expectNoPageOverflowX(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectClinicsReadable(page, theme)
    }
    await setTheme(page, "light")
  })

  test("edit dialog and delete-confirm are 44px at 820", async ({ page }) => {
    await freshClinics(page)
    await table(page, "Upcoming clinics")
      .getByRole("button", { name: "Actions for Houston Offensive Staff Clinic", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const edit = dialog(page, "Edit clinic")
    await expect(edit).toBeVisible()
    await expectFormTouch(edit, "820 dialog")
    await expectNotesUnclipped(edit, "820 dialog")
    await expectReadable(edit.getByRole("heading", { name: "Edit clinic" }), "820/edit dialog title", expect)
    await expectReadable(edit.getByText(/Dates are calendar days/), "820/edit dialog copy", expect)
    await expect(edit.getByRole("button", { name: "Delete clinic", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()

    await table(page, "Upcoming clinics")
      .getByRole("button", { name: "Actions for Houston Offensive Staff Clinic", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
    const confirm = dialog(page, "Delete this clinic?")
    await expect(confirm).toBeVisible()
    await expectMinHit(confirm.getByRole("button", { name: "Delete", exact: true }), "820 delete-confirm")
    await expectReadable(confirm.getByRole("heading", { name: "Delete this clinic?" }), "820/delete title", expect)
  })
})

test.describe("responsive Clinics (tablet landscape 1180)", () => {
  test.use({ viewport: SIZES["tablet-landscape"] })

  test("same ≤5-column tables, 44px targets, no overflow", async ({ page }) => {
    await freshClinics(page)
    await expect(table(page, "Upcoming clinics")).toBeVisible()
    await expect(cards(page, "Upcoming clinics")).toHaveCount(0)
    expect(await visibleHeaders(table(page, "Upcoming clinics"))).toEqual([
      "Name",
      "Date",
      "Type",
      "Owner",
      "Status",
    ])
    expect(await visibleHeaders(table(page, "Past clinics"))).toEqual([
      "Name",
      "Date",
      "Collected",
      "Status",
    ])
    await expectMinHit(addButton(page), "1180 Add clinic")
    await expectMinHit(resetButton(page), "1180 Reset")
    const menu = table(page, "Upcoming clinics").getByRole("button", {
      name: "Actions for Houston Offensive Staff Clinic",
      exact: true,
    })
    await expectMinHit(menu, "1180 row menu")
    await expect(menu).toHaveCSS("opacity", "1")
    await expectTabletTableFits(page, "Upcoming clinics")
    await expectTabletTableFits(page, "Past clinics")
    await expectNoPageOverflowX(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectClinicsReadable(page, theme)
    }
    await setTheme(page, "light")
  })
})

test.describe("responsive Clinics (desktop 1440)", () => {
  test.use({ viewport: SIZES.desktop })

  test("keeps the eight-column table and the Nova sm Add; no cards", async ({ page }) => {
    await freshClinics(page)
    await expect(table(page, "Upcoming clinics")).toBeVisible()
    await expect(cards(page, "Upcoming clinics")).toHaveCount(0)
    expect(await visibleHeaders(table(page, "Upcoming clinics"))).toEqual([
      "Name",
      "Date",
      "City",
      "Type",
      "Attend",
      "Collected",
      "Owner",
      "Status",
    ])
    const add = addButton(page)
    const box = await add.boundingBox()
    expect(box, "desktop Add").toBeTruthy()
    expect(box!.height, "desktop Add stays Nova sm, not 44").toBeLessThan(44)
    await expect(add).toHaveCSS("height", "28px")
    const resetBox = await resetButton(page).boundingBox()
    expect(resetBox, "desktop Reset").toBeTruthy()
    expect(resetBox!.height, "desktop Reset stays PersistenceNote h-6").toBeLessThan(44)
    const houston = table(page, "Upcoming clinics").getByRole("row", { name: /Houston Offensive/ })
    await expect(houston).toContainText("in 15 days")
    await expect(houston.getByRole("cell").nth(2)).toHaveText("Houston")
    await expect(houston.locator(".xl\\:hidden").first()).toBeHidden()
    await expectNoPageOverflowX(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectClinicsReadable(page, theme)
    }
    await setTheme(page, "light")
  })
})
