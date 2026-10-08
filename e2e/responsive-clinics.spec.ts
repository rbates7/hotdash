import { expect, test, type Locator, type Page } from "@playwright/test"

import { ROW_COLLAPSE_SLOT } from "../src/components/responsive-table"
import { expectReadable } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
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
  region(page, name).locator(`[data-slot='${ROW_COLLAPSE_SLOT}']`)
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add clinic", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function freshClinics(page: Page) {
  await page.goto("/clinics")
  await waitForHydration(page)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

async function expectMinHit(locator: Locator, label: string, min = 44) {
  const box = await locator.boundingBox()
  expect(box, label).toBeTruthy()
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(min)
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(min)
}

async function expectNoPageOverflowX(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(extra, `horizontal overflow ${extra}px`).toBeLessThanOrEqual(1)
}

async function visibleHeaders(tbl: Locator) {
  return tbl.getByRole("columnheader").evaluateAll((els) =>
    els.map((el) => el.textContent?.trim() ?? "").filter((t) => t && t !== "Actions")
  )
}

async function expectClinicsReadable(page: Page, theme: "light" | "dark") {
  await expectReadable(header(page), `${theme}/header`, expect)
  const upcoming = region(page, "Upcoming clinics")
  await expectReadable(upcoming.getByTestId("status-pill").first(), `${theme}/upcoming status`, expect)
  await expectReadable(upcoming.getByTestId("sample-data-tag").first(), `${theme}/upcoming sample`, expect)
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
    await expectNoPageOverflowX(page)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
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
    await expectMinHit(
      table(page, "Upcoming clinics").getByRole("button", {
        name: "Actions for Houston Offensive Staff Clinic",
        exact: true,
      }),
      "tablet row menu"
    )
    await expect(
      table(page, "Upcoming clinics").getByRole("row", { name: /Houston Offensive/ })
    ).toContainText("in 15 days · Houston")
    await expectNoPageOverflowX(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectClinicsReadable(page, theme)
    }
    await setTheme(page, "light")
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
    await expectMinHit(
      table(page, "Upcoming clinics").getByRole("button", {
        name: "Actions for Houston Offensive Staff Clinic",
        exact: true,
      }),
      "1180 row menu"
    )
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

  test("keeps the eight-column table and the 36px Add; no cards", async ({ page }) => {
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
    expect(box!.height, "desktop Add stays h-9").toBeLessThan(44)
    await expect(add).toHaveCSS("height", "36px")
    await expect(
      table(page, "Upcoming clinics").getByRole("row", { name: /Houston Offensive/ })
    ).toContainText("in 15 days")
    await expect(
      table(page, "Upcoming clinics").getByRole("row", { name: /Houston Offensive/ })
    ).not.toContainText("in 15 days · Houston")
    await expectNoPageOverflowX(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectClinicsReadable(page, theme)
    }
    await setTheme(page, "light")
  })
})
