import { expect, test, type Locator, type Page } from "@playwright/test"

import { addDays, formatDate, now, todayIn } from "../src/lib/clock"
import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { NOTE, countWrites, expectWritesSettled, persistenceNote, resetDemoData, writesTo } from "./support/persistence"
import { setTheme } from "./support/theme"

const STORAGE_KEY = "hotdash.community-development.v1"

const today = () => todayIn(now())

const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const header = (page: Page) => page.getByRole("main").locator("header").first()
const table = (page: Page) => page.getByRole("table", { name: "Giving initiatives", exact: true })
const bodyRows = (page: Page) => table(page).locator("tbody").getByRole("row")
const row = (page: Page, re: RegExp) => table(page).getByRole("row", { name: re })
const note = (page: Page, opts?: { failed?: boolean }) => persistenceNote(page, opts)
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add initiative", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const summary = (page: Page) => page.getByRole("group", { name: "Giving summary", exact: true })

async function openMenu(page: Page, name: string) {
  await table(page).getByRole("button", { name: `Actions for ${name}`, exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu
}

async function fresh(page: Page) {
  await page.goto("/community-development")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(bodyRows(page)).toHaveCount(8)
}

/**
 * WCAG contrast between the painted backgrounds of two controls (pressed
 * vs unpressed). Copied locally from the Clinics spec so e2e/support stays
 * untouched. Composites translucent fills onto the nearest opaque ancestor
 * so outline toggles are measured honestly.
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

async function expectPressedContrast(group: Locator, label: string) {
  const pressed = group.getByRole("button", { pressed: true })
  const unpressed = group.getByRole("button", { pressed: false }).first()
  await expect(pressed).toBeVisible()
  const ratio = await backgroundContrast(pressed, unpressed)
  expect(ratio, `${label} pressed vs unpressed ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
  await expectReadable(pressed, `${label} pressed`, expect)
}

test.describe("Community Development", () => {
  test("is reachable from the sidebar and shows the giving list", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "Community Development", exact: true }).click()
    await expect(page).toHaveURL(/\/community-development$/)
    await expect(header(page).getByRole("heading", { level: 1, name: "Community Development" })).toBeVisible()
    await expect(header(page).getByText("Giving and foundation work — not coach communities or content")).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "Community Development", exact: true })).toHaveAttribute(
      "data-active"
    )

    await expect(summary(page)).toBeVisible()
    await expect(summary(page)).toContainText("Active")
    await expect(summary(page)).toContainText("Upcoming (30 days)")
    await expect(summary(page)).toContainText("Done this year")
    await expect(table(page).getByRole("columnheader")).toHaveText([
      "Name",
      "Type",
      "Partner",
      "When",
      "Status",
      "Owner",
      "Impact",
      "Actions",
    ])
    await expect(bodyRows(page)).toHaveCount(8)
    await expect(page.getByTestId("section-count")).toHaveText("8")

    const day = today()
    const first = row(page, /Equipment drive for Yates High School/)
    await expect(first).toContainText(formatDate(addDays(day, 8)))
    await expect(first).toContainText("in 8 days")
    await expect(first.getByTestId("status-pill")).toHaveText("Active")
    await expect(first.getByTestId("type-pill")).toHaveText("Donation")
    await expect(row(page, /Refurbished iPads/).getByTestId("status-pill")).toHaveText("Done")
    await expect(row(page, /Chlk Foundation coaching scholarship/)).toContainText("Annual, each spring")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await fresh(page)
    await expectProbeCatchesSabotage(header(page).getByTestId("sample-data-tag"), "header tag", expect)
    const first = row(page, /Equipment drive for Yates High School/)
    await expectProbeCatchesSabotage(first.getByTestId("sample-data-tag"), "row tag", expect)
    await expectProbeCatchesSabotage(first.getByTestId("status-pill"), "status pill", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(
      row(page, /Refurbished iPads/).getByTestId("status-pill"),
      "status pill (dark)",
      expect
    )
    await setTheme(page, "light")
  })

  test("labels every seed row as sample data, readable at ≥ 4.5:1 on every text node, light and dark", async ({
    page,
  }) => {
    await fresh(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(header(page).getByRole("heading", { level: 1 }), `${theme}/title`, expect)
      await expectReadable(header(page).getByText("Giving and foundation work"), `${theme}/lede`, expect)
      await expectReadable(header(page).getByTestId("sample-data-tag"), `${theme}/header tag`, expect)
      await expectReadable(summary(page), `${theme}/summary`, expect)
      await expectReadable(page.getByRole("group", { name: "Filter by type" }), `${theme}/type filter`, expect)
      await expectReadable(page.getByRole("group", { name: "Filter by status" }), `${theme}/status filter`, expect)
      const tags = table(page).getByTestId("sample-data-tag")
      await expect(tags).toHaveCount(8)
      for (const tag of await tags.all()) {
        await expect(tag).toHaveText("Sample data")
        await expectReadable(tag, `${theme}/row tag`, expect)
      }
      const statusPills = table(page).getByTestId("status-pill")
      await expect(statusPills).toHaveCount(8)
      for (const pill of await statusPills.all()) {
        await expectReadable(pill, `${theme}/status`, expect)
      }
      const typePills = table(page).getByTestId("type-pill")
      await expect(typePills).toHaveCount(8)
      for (const pill of await typePills.all()) {
        await expectReadable(pill, `${theme}/type`, expect)
      }
      await expectReadable(table(page), `${theme}/table`, expect)
    }
    await setTheme(page, "light")
  })

  test("filter chips and dialog Type/Status pressed options read at ≥ 3:1 vs unpressed, light and dark", async ({
    page,
  }) => {
    await fresh(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectPressedContrast(page.getByRole("group", { name: "Filter by type" }), `${theme}/type filter`)
      await expectPressedContrast(page.getByRole("group", { name: "Filter by status" }), `${theme}/status filter`)
      await addButton(page).click()
      const add = dialog(page, "Add initiative")
      await expect(add).toBeVisible()
      await expectPressedContrast(add.getByRole("group", { name: "Type", exact: true }), `${theme}/Type`)
      await expectPressedContrast(add.getByRole("group", { name: "Status", exact: true }), `${theme}/Status`)
      await page.keyboard.press("Escape")
      await expect(add).toBeHidden()
    }
    await setTheme(page, "light")
  })

  test("Add initiative and a row menu work from the keyboard", async ({ page }) => {
    await fresh(page)
    await header(page).getByRole("heading", { level: 1, name: "Community Development" }).click()
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab")
      const label = await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label") ?? el.textContent?.trim()}` : "none"
      })
      seen.push(label)
      if (label === "button:Add initiative") break
    }
    expect(seen.at(-1), seen.join(" | ")).toBe("button:Add initiative")
    await page.keyboard.press("Enter")
    const add = dialog(page, "Add initiative")
    await expect(add.getByLabel("Name")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(add).toBeHidden()
    await expect(addButton(page)).toBeFocused()

    const trigger = table(page).getByRole("button", {
      name: "Actions for Equipment drive for Yates High School",
      exact: true,
    })
    await trigger.focus()
    await page.keyboard.press("Enter")
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("Add/Edit dialog, detail sheet, delete confirm, and empty state are readable in light and dark", async ({
    page,
  }) => {
    await fresh(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)

      await addButton(page).click()
      const add = dialog(page, "Add initiative")
      await expect(add).toBeVisible()
      await expectReadable(add, `${theme}/add dialog`, expect)
      await page.keyboard.press("Escape")
      await expect(add).toBeHidden()

      let menu = await openMenu(page, "Equipment drive for Yates High School")
      await menu.getByRole("menuitem", { name: "Edit", exact: true }).click()
      const edit = dialog(page, "Edit initiative")
      await expect(edit).toBeVisible()
      await expectReadable(edit, `${theme}/edit dialog`, expect)
      await page.keyboard.press("Escape")
      await expect(edit).toBeHidden()

      await row(page, /Equipment drive for Yates High School/)
        .getByRole("button", { name: "Equipment drive for Yates High School", exact: true })
        .click()
      const detail = page.getByRole("dialog", { name: /Equipment drive for Yates High School/ })
      await expect(detail).toBeVisible()
      await expectReadable(detail, `${theme}/detail sheet`, expect)
      await page.keyboard.press("Escape")
      await expect(detail).toBeHidden()

      menu = await openMenu(page, "Equipment drive for Yates High School")
      await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
      const confirm = dialog(page, "Delete this initiative?")
      await expect(confirm).toBeVisible()
      await expectReadable(confirm, `${theme}/delete confirm`, expect)
      await confirm.getByRole("button", { name: "Keep it", exact: true }).click()
      await expect(confirm).toBeHidden()
    }

    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ initiatives: [], nextId: 9 })), STORAGE_KEY)
    await page.reload()
    const empty = page.getByRole("status", { name: "No initiatives", exact: true })
    await expect(empty).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(empty, `${theme}/empty state`, expect)
    }
    await setTheme(page, "light")
  })

  test("happy path: filter → add → edit status → detail → delete → reload persists → Reset back to seed", async ({
    page,
  }) => {
    await fresh(page)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    const day = today()

    await page.getByRole("group", { name: "Filter by type" }).getByRole("button", { name: "Volunteer", exact: true }).click()
    await expect(bodyRows(page)).toHaveCount(3)
    await expect(page.getByTestId("section-count")).toHaveText("3")
    await page.getByRole("group", { name: "Filter by type" }).getByRole("button", { name: "All types", exact: true }).click()
    await expect(bodyRows(page)).toHaveCount(8)

    await addButton(page).click()
    const add = dialog(page, "Add initiative")
    await expect(add.getByLabel("Name")).toBeFocused()
    await expect(add.getByLabel("Date")).toHaveValue(day)
    await expect(add.getByLabel("Owner")).toHaveValue("Rashad")
    await expect(add.getByRole("button", { name: "Add initiative", exact: true })).toBeDisabled()
    await add.getByLabel("Name").fill("Saturday park clean-up")
    await add.getByLabel("Beneficiary / partner").fill("Buffalo Bayou Park")
    await add.getByRole("group", { name: "Type" }).getByRole("button", { name: "Outreach event", exact: true }).click()
    await add.getByLabel("Date").fill(addDays(day, 4))
    await add.getByLabel("What we gave / impact").fill("two trash bags")
    const spawn = add.getByRole("button", { name: "Could spawn a Clinic", exact: true })
    await expect(spawn).toBeDisabled()
    await expect(spawn).toHaveAttribute("title", "Soon — an outreach or volunteer day could become a Clinic row")
    await add.getByRole("button", { name: "Add initiative", exact: true }).click()
    await expect(add).toBeHidden()

    const added = row(page, /Saturday park clean-up/)
    await expect(added).toBeVisible()
    await expect(added).toContainText("in 4 days")
    await expect(added.getByTestId("type-pill")).toHaveText("Outreach event")
    await expect(added.getByTestId("status-pill")).toHaveText("Planned")
    await expect(added.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(page.getByTestId("section-count")).toHaveText("9")
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(resetButton(page)).toBeEnabled()

    let menu = await openMenu(page, "Saturday park clean-up")
    await menu.getByRole("menuitem", { name: "Mark active", exact: true }).click()
    await expect(added.getByTestId("status-pill")).toHaveText("Active")

    await added.getByRole("button", { name: "Saturday park clean-up", exact: true }).click()
    const detail = page.getByRole("dialog", { name: /Saturday park clean-up/ })
    await expect(detail).toBeVisible()
    await expect(detail).toContainText("Buffalo Bayou Park")
    await expect(detail).toContainText("two trash bags")
    await expect(detail.getByTestId("status-pill")).toHaveText("Active")
    await page.keyboard.press("Escape")
    await expect(detail).toBeHidden()

    menu = await openMenu(page, "Booster-club talk on giving back")
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
    const confirm = dialog(page, "Delete this initiative?")
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText("Booster-club talk on giving back")
    await confirm.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(table(page).getByText("Booster-club talk on giving back")).toHaveCount(0)
    await expect(bodyRows(page)).toHaveCount(8)

    await page.reload()
    await expect(row(page, /Saturday park clean-up/).getByTestId("status-pill")).toHaveText("Active")
    await expect(table(page).getByText("Booster-club talk on giving back")).toHaveCount(0)
    await expect(note(page)).toHaveText(NOTE.saved)

    await resetDemoData(page, header(page))
    await expect(bodyRows(page)).toHaveCount(8)
    await expect(row(page, /Booster-club talk on giving back/)).toBeVisible()
    await expect(table(page).getByText("Saturday park clean-up")).toHaveCount(0)
    await expect(note(page)).toHaveText(NOTE.unsaved)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
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
    await page.goto("/community-development")
    await expect(note(page)).toHaveText(NOTE.unsaved)

    const menu = await openMenu(page, "Youth flag-football clinic volunteer day")
    await menu.getByRole("menuitem", { name: "Mark active", exact: true }).click()
    await expect(row(page, /Youth flag-football/).getByTestId("status-pill")).toHaveText("Active")
    await expect(note(page, { failed: true })).toHaveText(NOTE.failed)
    await expect(note(page, { failed: true })).not.toContainText("Saved")
    await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await context.close()
  })

  test("two tabs stay in sync and the writes settle: one per edit, none for a hydrate", async ({ browser }) => {
    const context = await browser.newContext()
    await countWrites(context, STORAGE_KEY)
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto("/community-development")
    await a.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await a.reload()
    await b.goto("/community-development")
    await expect(note(a)).toHaveText(NOTE.unsaved)
    await expect(note(b)).toHaveText(NOTE.unsaved)
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)
    await settled(a, 0)
    await settled(b, 0)

    let menu = await openMenu(a, "Youth flag-football clinic volunteer day")
    await menu.getByRole("menuitem", { name: "Mark active", exact: true }).click()
    await expect(row(b, /Youth flag-football/).getByTestId("status-pill")).toHaveText("Active")
    await expect(note(b)).toHaveText(NOTE.saved)
    await expect(resetButton(b)).toBeEnabled()
    await settled(a, 1)
    await settled(b, 0)

    menu = await openMenu(b, "Booster-club talk on giving back")
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await dialog(b, "Delete this initiative?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(bodyRows(a)).toHaveCount(7)
    await expect(table(a).getByText("Booster-club talk on giving back")).toHaveCount(0)
    await settled(a, 1)
    await settled(b, 1)

    await resetDemoData(a, header(a))
    await expect(bodyRows(b)).toHaveCount(8)
    await expect(row(b, /Youth flag-football/).getByTestId("status-pill")).toHaveText("Planned")
    await expect(note(b)).toHaveText(NOTE.unsaved)
    await expect(resetButton(b)).toHaveAttribute("aria-disabled", "true")
    await settled(a, 1)
    await settled(b, 1)
    expect(await a.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await context.close()
  })

  test("a corrupt saved copy renders the seed without being touched; the first real save parks it", async ({
    browser,
  }) => {
    const context = await browser.newContext()
    await countWrites(context, STORAGE_KEY)
    const page = await context.newPage()
    const junk = '{"initiatives":[{"id":"initiative-1","type":"webinar"}],"nextId":2}'
    await page.goto("/community-development")
    await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [STORAGE_KEY, junk] as const)
    await page.reload()
    await expect(bodyRows(page)).toHaveCount(8)
    await expect(note(page)).toHaveText(NOTE.unsaved)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(junk)
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)
    expect(await page.evaluate((key) => localStorage.getItem(`${key}.rejected`), STORAGE_KEY)).toBeNull()

    const menu = await openMenu(page, "Youth flag-football clinic volunteer day")
    await menu.getByRole("menuitem", { name: "Mark active", exact: true }).click()
    await expect(note(page)).toHaveText(NOTE.saved)
    const parked = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(`${key}.rejected`) ?? "[]") as { raw: string; why: string }[],
      STORAGE_KEY
    )
    expect(parked).toHaveLength(1)
    expect(parked[0].why).toBe("failed validation")
    expect(parked[0].raw).toBe(junk)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('"active"')
    await context.close()
  })
})

test.describe("Community Development at 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("the giving table fits at 1440 without clipping the actions column", async ({ page }) => {
    await fresh(page)
    const size = await table(page).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(size.scrollWidth, `table overflow ${size.scrollWidth} > ${size.clientWidth}`).toBeLessThanOrEqual(
      size.clientWidth + 1
    )
    await expect(
      table(page).getByRole("button", { name: "Actions for Equipment drive for Yates High School", exact: true })
    ).toBeInViewport()
  })
})
