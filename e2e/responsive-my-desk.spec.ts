import { expect, test, type Locator, type Page } from "@playwright/test"

import { addDays, now, todayIn } from "../src/lib/clock"
import { carryFromLabel } from "../src/lib/my-desk"
import { expectReadable, settleAnimations } from "./support/contrast"
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
 * My Desk at phone / tablet / desktop. No My Desk frame in Deke
 * `mEEFvPkzpt9woPbW5wATec`; phone cards + sheet and tablet cards follow
 * Sales #29 / Bugs #31. 1180 uses the 820 stacked panes. Desktop (≥1280)
 * stays develop's two-column list.
 */

const STORAGE_KEY = "hotdash.my-desk.v2"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const todayList = (page: Page) => page.getByRole("region", { name: "Today list", exact: true })
const notes = (page: Page) => page.getByRole("region", { name: "Notes", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const todoBox = (page: Page, title: string) =>
  todayList(page).getByRole("checkbox", { name: title, exact: true })
const todoRow = (page: Page, title: string) => todoBox(page, title).locator("xpath=ancestor::li[1]")
const openTodo = (page: Page, title: string) =>
  todayList(page).getByRole("button", { name: `Open ${title}`, exact: true })
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true })
const sheetActions = (page: Page, title: string) =>
  sheet(page, title).getByRole("group", { name: "To-do actions", exact: true }).getByRole("button")

async function fresh(page: Page) {
  await page.goto("/my-desk")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)
}

async function expectTapTarget(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(44)
}

const INTERACTIVE =
  "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='menuitemradio'], [role='checkbox'], [role='switch'], [role='tab'], [tabindex]:not([tabindex='-1'])"

async function expectAllTargets44(scope: Locator, label: string) {
  await settleAnimations(scope.page())
  const measured = await scope.locator(INTERACTIVE).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const name =
        el.getAttribute("aria-label") ?? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48)
      return {
        name: `${el.tagName.toLowerCase()} "${name}"`,
        width: r.width,
        height: r.height,
        painted: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
      }
    })
  )
  const painted = measured.filter((m) => m.painted)
  expect(painted.length, `${label}: controls measured`).toBeGreaterThan(0)
  const small = painted
    .filter((m) => m.width < 44 || m.height < 44)
    .map((m) => `${m.name} ${m.width.toFixed(1)}×${m.height.toFixed(1)}`)
  expect(small, `${label}: every control ≥ 44×44`).toEqual([])
}

async function expectUnclipped(locator: Locator, label: string) {
  const box = await locator.evaluate((el) => ({
    scroll: (el as HTMLElement).scrollHeight,
    client: (el as HTMLElement).clientHeight,
  }))
  expect(box.scroll, `${label}: content not clipped`).toBeLessThanOrEqual(box.client + 1)
}

async function expectStackedPanes(page: Page, label: string) {
  const todayBox = await todayList(page).boundingBox()
  const notesBox = await notes(page).boundingBox()
  expect(todayBox && notesBox, `${label}: panes painted`).toBeTruthy()
  expect(notesBox!.y, `${label}: Notes under Today`).toBeGreaterThan(todayBox!.y + todayBox!.height - 2)
}

async function expectSideBySidePanes(page: Page, label: string) {
  const todayBox = await todayList(page).boundingBox()
  const notesBox = await notes(page).boundingBox()
  expect(todayBox && notesBox, `${label}: panes painted`).toBeTruthy()
  expect(Math.abs(todayBox!.y - notesBox!.y), `${label}: one row`).toBeLessThan(8)
  expect(notesBox!.x, `${label}: Notes beside Today`).toBeGreaterThan(todayBox!.x + todayBox!.width - 2)
}

type Size = "390" | "820" | "1180"

async function openDialog(page: Page, size: Size, what: "Add" | "Edit" | "Delete", title = "Call Aledo") {
  if (what === "Add") {
    await header(page).getByRole("button", { name: "Add to-do", exact: true }).click()
    return dialog(page, "Add to-do")
  }
  if (size === "390") {
    await openTodo(page, title).click()
    await expect(sheet(page, title)).toBeVisible()
    await sheetActions(page, title).filter({ hasText: what === "Edit" ? "Edit" : "Delete" }).click()
  } else {
    await todayList(page)
      .getByRole("button", { name: `${what} ${title}`, exact: true })
      .click()
  }
  return dialog(page, what === "Edit" ? "Edit to-do" : "Delete this to-do?")
}

async function expectDialogs44(page: Page, size: Size) {
  for (const what of ["Add", "Edit", "Delete"] as const) {
    const d = await openDialog(page, size, what)
    await expect(d).toBeVisible()
    await settleAnimations(page)
    await expectAllTargets44(d, `${size} ${what} dialog`)
    await expectTapTarget(d.getByRole("button", { name: "Close", exact: true }), `${size} ${what} ×`)
    await expect(d, `${size} ${what} fits the screen`).toBeInViewport({ ratio: 1 })
    if (what === "Add" || what === "Edit") {
      const note = d.getByLabel(/Note/)
      await expectUnclipped(note, `${size} ${what} note`)
      await note.fill("x".repeat(280))
      await expectUnclipped(note, `${size} ${what} 280 note`)
    }
    await page.keyboard.press("Escape")
    await expect(d).toBeHidden()
    if (size === "390" && what !== "Add") {
      await page.keyboard.press("Escape")
      await expect(sheet(page, "Call Aledo")).toBeHidden()
    }
  }
}

const settle = (locator: Locator) => settleAnimations(locator.page())

/* ------------------------------------------------------------------ phone */

test.describe("responsive My Desk (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("stacks Today over Notes as cards and does not scroll sideways", async ({ page }) => {
    await fresh(page)
    await expectStackedPanes(page, "390")
    await expect(openTodo(page, "Call Aledo")).toBeVisible()
    await expect(todayList(page).getByRole("button", { name: "Edit Call Aledo", exact: true })).toBeHidden()
    await expect(todayList(page).getByRole("button", { name: "Delete Call Aledo", exact: true })).toBeHidden()
    await expect(todoRow(page, "Call Aledo")).toContainText("HC — Friday walk-through")
    await expect(todoRow(page, "Call Aledo").getByTestId("sample-data-tag")).toBeVisible()

    const add = header(page).getByRole("button", { name: "Add to-do", exact: true })
    await expectTapTarget(add, "Add to-do")
    await expectTapTarget(todoBox(page, "Call Aledo"), "checkbox")
    await expectTapTarget(openTodo(page, "Call Aledo"), "open")

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    await expectNoOverflowX(page)
    await expectAllTargets44(main(page), "390 main")
  })

  test("a card opens the bottom sheet; every desktop action stays reachable", async ({ page }) => {
    await fresh(page)
    await openTodo(page, "Call Aledo").click()
    const s = sheet(page, "Call Aledo")
    await expect(s).toBeVisible()
    await expect(s).toHaveAttribute("data-side", "bottom")
    await expect(s).toContainText("HC — Friday walk-through")
    const actions = sheetActions(page, "Call Aledo")
    await expect(actions).toHaveCount(3)
    await expect(actions.nth(0)).toHaveText("Mark done")
    await expect(actions.nth(1)).toHaveText("Edit")
    await expect(actions.nth(2)).toHaveText("Delete")
    await expectAllTargets44(s, "390 sheet")

    await actions.nth(0).click()
    await expect(actions.nth(0)).toHaveText("Mark open")

    await page.keyboard.press("Escape")
    await expect(s).toBeHidden()
    await expect(todoBox(page, "Call Aledo")).toHaveAttribute("aria-checked", "true")
    await expect(openTodo(page, "Call Aledo")).toBeFocused()

    await openTodo(page, "Call Aledo").click()
    await sheetActions(page, "Call Aledo").filter({ hasText: "Edit" }).click()
    const edit = dialog(page, "Edit to-do")
    await expect(edit).toBeVisible()
    await expect(s).toBeHidden()
    await expect(edit.getByLabel("Title")).toHaveValue("Call Aledo")
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
    await expect(openTodo(page, "Call Aledo")).toBeFocused()

    await header(page).getByRole("button", { name: "Add to-do", exact: true }).click()
    const add = dialog(page, "Add to-do")
    await add.getByLabel("Title").fill("Walk the dog")
    await add.getByRole("button", { name: "Add to-do", exact: true }).click()
    await expect(todoBox(page, "Walk the dog")).toBeVisible()
  })

  test("the sheet's × (44×44) and a backdrop tap close it; focus returns; focus is trapped", async ({
    page,
  }) => {
    await fresh(page)
    await openTodo(page, "Clinic follow-up").click()
    const s = sheet(page, "Clinic follow-up")
    await expect(s).toBeVisible()
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, s)

    const close = s.getByRole("button", { name: "Close", exact: true })
    await expectTapTarget(close, "sheet ×")
    const box = (await close.boundingBox())!
    expect(Math.round(box.width)).toBe(44)
    expect(Math.round(box.height)).toBe(44)
    const title = (await s.getByRole("heading", { name: "Clinic follow-up" }).boundingBox())!
    expect(title.x + title.width, "title clear of the ×").toBeLessThanOrEqual(box.x)
    await close.click()
    await expect(s).toBeHidden()
    await expect(openTodo(page, "Clinic follow-up")).toBeFocused()
    await expectScrollLock(page, false)

    await openTodo(page, "Clinic follow-up").click()
    await expect(s).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 195, y: 40 } })
    await expect(s).toBeHidden()
    await expect(openTodo(page, "Clinic follow-up")).toBeFocused()
    await expectScrollLock(page, false)
  })

  test("a long title in the sheet stays clear of the 44px ×", async ({ page }) => {
    const day = todayIn(now())
    const title = "Follow up with the Aledo athletic director about Friday walk-through times"
    await page.goto("/my-desk")
    await page.evaluate(
      ([key, today, t]) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            todos: [{ id: "todo-30", title: t, note: "", done: false, createdOn: today, doneOn: null }],
            nextId: 31,
            scratch: "",
            scratchUpdatedAt: new Date().toISOString(),
          })
        ),
      [STORAGE_KEY, day, title] as const
    )
    await page.reload()
    await waitForHydration(page)
    await openTodo(page, title).click()
    const s = sheet(page, title)
    await expect(s).toBeVisible()
    await settle(s)
    const close = (await s.getByRole("button", { name: "Close", exact: true }).boundingBox())!
    const heading = (await s.getByRole("heading", { name: title }).boundingBox())!
    expect(heading.width, "title is long enough to reach the ×").toBeGreaterThan(250)
    expect(heading.x + heading.width, "long title clear of the ×").toBeLessThanOrEqual(close.x + 0.5)
  })

  test("after Delete from the sheet, focus moves to the next card", async ({ page }) => {
    await fresh(page)
    const titles = await todayList(page)
      .locator("[data-todo]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-todo")))
    const i = titles.indexOf("todo-1")
    expect(i).toBeGreaterThanOrEqual(0)
    await openTodo(page, "Call Aledo").click()
    await sheetActions(page, "Call Aledo").filter({ hasText: "Delete" }).click()
    await dialog(page, "Delete this to-do?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(todoBox(page, "Call Aledo")).toHaveCount(0)
    await expect(openTodo(page, "Clinic follow-up")).toBeFocused()
  })

  test("dialogs are 44px: fields, buttons, ×, checkbox; note does not clip 280 characters", async ({
    page,
  }) => {
    await fresh(page)
    await expectDialogs44(page, "390")
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive My Desk (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("stacks Today over Notes as cards with 44px Edit / Delete", async ({ page }) => {
      await fresh(page)
      await expectStackedPanes(page, String(VIEWPORTS[name].width))
      await expect(openTodo(page, "Call Aledo")).toBeHidden()
      const edit = todayList(page).getByRole("button", { name: "Edit Call Aledo", exact: true })
      const del = todayList(page).getByRole("button", { name: "Delete Call Aledo", exact: true })
      await expect(edit).toBeVisible()
      await expect(del).toBeVisible()
      await expectTapTarget(edit, "Edit")
      await expectTapTarget(del, "Delete")
      await expectTapTarget(todoBox(page, "Call Aledo"), "checkbox")
      await expectTapTarget(
        header(page).getByRole("button", { name: "Add to-do", exact: true }),
        "Add to-do"
      )

      await edit.click()
      const d = dialog(page, "Edit to-do")
      await expect(d.getByLabel("Title")).toHaveValue("Call Aledo")
      await page.keyboard.press("Escape")
      await expect(d).toBeHidden()
      await expect(edit).toBeFocused()

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      await expectNoOverflowX(page)
      await expectAllTargets44(main(page), `${VIEWPORTS[name].width} main`)
    })

    test("dialogs are 44px: fields, buttons, ×, checkbox; note does not clip 280 characters", async ({
      page,
    }) => {
      await fresh(page)
      await expectDialogs44(page, String(VIEWPORTS[name].width) as Size)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive My Desk (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: two columns, inline Edit / Delete, no open control", async ({ page }) => {
    await fresh(page)
    await expectSideBySidePanes(page, "1440")
    await expect(openTodo(page, "Call Aledo")).toBeHidden()
    await expect(todayList(page).getByRole("button", { name: "Edit Call Aledo", exact: true })).toBeVisible()
    await expect(todayList(page).getByRole("button", { name: "Delete Call Aledo", exact: true })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    await todayList(page).getByRole("button", { name: "Edit Call Aledo", exact: true }).click()
    const edit = dialog(page, "Edit to-do")
    await expect(edit).toBeVisible()
    await settle(edit)
    await expect(edit.getByLabel("Title")).toHaveCSS("height", "32px")
    await expect(edit.getByRole("button", { name: "Save changes" })).toHaveCSS("height", "32px")
    await expect(edit.getByRole("button", { name: "Close", exact: true })).toHaveCSS("height", "28px")
    const note = await edit.getByLabel(/Note/).boundingBox()
    expect(note, "desktop note painted").toBeTruthy()
    expect(note!.height, "note stays develop rows").toBeLessThan(90)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
  })
})

test.describe("responsive My Desk loading (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("the loading skeleton keeps develop's height on desktop", async ({ page }) => {
    await page.goto("/my-desk?shot=loading")
    const skeleton = page.getByRole("status", { name: "Loading saved desk", exact: true })
    await expect(skeleton).toBeVisible()
    const box = (await skeleton.boundingBox())!
    expect(Math.round(box.height), "min(560px, 100svh - 10rem), not stretched").toBe(560)
  })
})

/* ------------------------------------------------------------- carry-over */

test.describe("responsive My Desk carry-over (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("a carried row keeps its from-day label on the card and in the sheet", async ({ page }) => {
    const day = todayIn(now())
    const yesterday = addDays(day, -1)
    const label = carryFromLabel(yesterday, day)
    await page.goto("/my-desk")
    await page.evaluate(
      ([key, today, prior]) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            todos: [
              {
                id: "todo-20",
                title: "Finish the packet",
                note: "Aledo",
                done: false,
                createdOn: prior,
                doneOn: null,
              },
              {
                id: "todo-22",
                title: "Call today",
                note: "",
                done: false,
                createdOn: today,
                doneOn: null,
              },
            ],
            nextId: 23,
            scratch: "",
            scratchUpdatedAt: new Date().toISOString(),
          })
        )
      },
      [STORAGE_KEY, day, yesterday] as const
    )
    await page.reload()
    await waitForHydration(page)
    await expect(todoRow(page, "Finish the packet").getByTestId("carry-from")).toContainText(label ?? "")
    await expect(todoBox(page, "Finish the packet")).toHaveAccessibleDescription(/added /)
    await openTodo(page, "Finish the packet").click()
    await expect(sheet(page, "Finish the packet").getByTestId("sheet-carry-from")).toContainText(
      label ?? ""
    )
  })
})

/* ------------------------------------------------------------- focus ring */

async function leftEdgeDiff(page: Page, unfocused: Buffer, focused: Buffer, width = 3) {
  return page.evaluate(
    async ({ a, b, width }) => {
      const load = async (src: string) => {
        const img = new Image()
        img.src = `data:image/png;base64,${src}`
        await img.decode()
        return img
      }
      const [ia, ib] = await Promise.all([load(a), load(b)])
      const pixels = (img: HTMLImageElement) => {
        const canvas = Object.assign(document.createElement("canvas"), {
          width: img.width,
          height: img.height,
        })
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, width, img.height).data
      }
      const [pa, pb] = [pixels(ia), pixels(ib)]
      const rows = Math.min(ia.height, ib.height)
      let changedRows = 0
      let checkedRows = 0
      for (let y = 8; y < rows - 8; y++) {
        checkedRows++
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(pa[i + c] - pb[i + c])))
          if (delta > 8) {
            changedRows++
            break
          }
        }
      }
      return { changedRows, checkedRows, sameSize: ia.width === ib.width && ia.height === ib.height }
    },
    { a: unfocused.toString("base64"), b: focused.toString("base64"), width }
  )
}

for (const [size, viewport] of [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
] as const) {
  test.describe(`focus ring My Desk (${size})`, () => {
    test.use({ viewport })

    test(`a Tab-focused control shows its ring inside the card at ${size}`, async ({ page }) => {
      await fresh(page)
      const card = size === "390" ? todoRow(page, "Call Aledo") : todoRow(page, "Clinic follow-up")
      const control =
        size === "390" ? openTodo(page, "Call Aledo") : todoBox(page, "Clinic follow-up")
      await card.scrollIntoViewIfNeeded()
      await page.mouse.move(viewport.width - 1, viewport.height - 1)
      const unfocused = await control.screenshot({ animations: "disabled" })

      if (size === "390") {
        await todoBox(page, "Call Aledo").focus()
      } else {
        await todayList(page).getByRole("button", { name: "Delete Call Aledo", exact: true }).focus()
      }
      await page.keyboard.press("Tab")
      await expect(control).toBeFocused()
      expect(await control.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
      const shadow = await control.evaluate((el) => getComputedStyle(el).boxShadow)
      expect(shadow, "ring drawn inset").toContain("inset")

      const focused = await control.screenshot({ animations: "disabled" })
      const diff = await leftEdgeDiff(page, unfocused, focused)
      expect(diff.sameSize).toBe(true)
      expect(diff.checkedRows).toBeGreaterThan(20)
      expect(diff.changedRows, `${size}: ring visible just inside the left edge`).toBeGreaterThan(0)
    })
  })
}

/* --------------------------------------------------------------- readable */

const READABLE = [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of READABLE) {
    test.describe(`readable My Desk (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const label = `${theme}/${size}`
        await expectReadable(header(page).getByRole("heading", { level: 1 }), `${label}/title`, expect)
        await expectReadable(header(page).locator("p").first(), `${label}/subtitle`, expect)
        await expectReadable(persistenceNote(page), `${label}/note`, expect)
        await expectReadable(header(page).getByTestId("sample-data-tag"), `${label}/header tag`, expect)
        await expectReadable(todayList(page), `${label}/today`, expect)
        await expectReadable(
          header(page).getByRole("button", { name: "Add to-do", exact: true }),
          `${label}/Add to-do`,
          expect
        )

        if (size === "390") {
          await openTodo(page, "Call Aledo").click()
          const s = sheet(page, "Call Aledo")
          await expect(s).toBeVisible()
          await expectReadable(s, `${label}/sheet`, expect)
          await expectReadable(s.getByRole("button", { name: "Close", exact: true }), `${label}/sheet ×`, expect)
          await expectReadable(
            s.getByRole("button", { name: "Delete", exact: true }),
            `${label}/sheet Delete`,
            expect
          )
          await page.keyboard.press("Escape")
          await expect(s).toBeHidden()
        }

        for (const what of ["Add", "Edit", "Delete"] as const) {
          const d = await openDialog(page, size, what)
          await expect(d).toBeVisible()
          await settleAnimations(page)
          if (what === "Add") await d.getByLabel("Title").fill("Coach Test")
          await expectReadable(d, `${label}/${what} dialog`, expect)
          await expectReadable(
            d.getByRole("button", { name: "Close", exact: true }),
            `${label}/${what} ×`,
            expect
          )
          if (what === "Delete") {
            await expectReadable(
              d.getByRole("button", { name: "Delete", exact: true }),
              `${label}/Delete confirm`,
              expect
            )
          }
          await page.keyboard.press("Escape")
          await expect(d).toBeHidden()
        }

        await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
          todos: [],
          nextId: 1,
          scratch: "",
          scratchUpdatedAt: new Date().toISOString(),
        })), STORAGE_KEY)
        await page.reload()
        await waitForHydration(page)
        await expect(persistenceNote(page)).toHaveText(NOTE.saved)
        const reset = header(page).getByRole("button", { name: "Reset", exact: true })
        await expect(reset).toBeEnabled()
        await expectTapTarget(reset, `${label}/Reset`)
        await expectReadable(reset, `${label}/enabled Reset`, expect)
      })
    })
  }
}
