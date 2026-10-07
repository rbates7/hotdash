import { expect, test, type Page } from "@playwright/test"

import { formatDeskDate, SEED_SCRATCH } from "../src/lib/my-desk"
import { now, todayIn } from "../src/lib/clock"
import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { NOTE, countWrites, expectWritesSettled, persistenceNote, resetDemoData, writesTo } from "./support/persistence"
import { setTheme } from "./support/theme"

const STORAGE_KEY = "hotdash.my-desk.v1"

const today = () => todayIn(now())

const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const header = (page: Page) => page.getByRole("main").locator("header").first()
const todayList = (page: Page) => page.getByRole("region", { name: "Today list", exact: true })
const notes = (page: Page) => page.getByRole("region", { name: "Notes", exact: true })
const note = (page: Page, opts?: { failed?: boolean }) => persistenceNote(page, opts)
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add to-do", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const todoBox = (page: Page, title: string) => todayList(page).getByRole("checkbox", { name: title, exact: true })
const todoRow = (page: Page, title: string) => todoBox(page, title).locator("xpath=ancestor::li[1]")

async function freshDesk(page: Page) {
  await page.goto("/my-desk")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)
}

test.describe("My Desk", () => {
  test("is reachable from the sidebar and shows the mock's two cards", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "My Desk", exact: true }).click()
    await expect(page).toHaveURL(/\/my-desk$/)
    await expect(header(page).getByRole("heading", { level: 1, name: "My Desk" })).toBeVisible()
    await expect(header(page).getByText("Personal — not the agent board")).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "My Desk", exact: true })).toHaveAttribute("data-active")

    await expect(todayList(page)).toBeVisible()
    await expect(notes(page)).toBeVisible()
    await expect(page.getByTestId("today-date")).toHaveText(formatDeskDate(today()))
    await expect(page.getByTestId("open-count")).toHaveText("5")
    await expect(todoBox(page, "Call Aledo")).toHaveAttribute("aria-checked", "false")
    await expect(todoBox(page, "Text May — Dallas night")).toHaveAttribute("aria-checked", "true")
    await expect(todoRow(page, "Text May — Dallas night")).toHaveAttribute("data-done", "true")
    await expect(notes(page).getByLabel("Scratch")).toHaveValue(SEED_SCRATCH)
    await expect(todayList(page)).toContainText("Personal list. Not Issues. Not agent work.")
    await expect(notes(page)).toContainText("One note. Scratchpad — not a docs product.")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await freshDesk(page)
    await expectProbeCatchesSabotage(header(page).getByTestId("sample-data-tag"), "header tag", expect)
    await expectProbeCatchesSabotage(todoRow(page, "Call Aledo").getByTestId("sample-data-tag"), "row tag", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(todoRow(page, "Confirm Austin flight"), "done row (dark)", expect)
    await setTheme(page, "light")
  })

  test("labels every seed row as sample data, readable at ≥ 4.5:1 on every text node, light and dark", async ({ page }) => {
    await freshDesk(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(header(page), `${theme}/header`, expect)
      await expectReadable(todayList(page), `${theme}/today`, expect)
      await expectReadable(notes(page), `${theme}/notes`, expect)
      await expectReadable(todoRow(page, "Text May — Dallas night"), `${theme}/done row`, expect)
      await expectReadable(todoRow(page, "Confirm Austin flight"), `${theme}/done row 2`, expect)
      const tags = todayList(page).getByTestId("sample-data-tag")
      await expect(tags).toHaveCount(7)
      for (const tag of await tags.all()) {
        await expect(tag).toHaveText("Sample data")
        await expectReadable(tag, `${theme}/row tag`, expect)
      }
    }
    await setTheme(page, "light")
  })

  test("happy path: add → check off → edit → delete → type in Scratch → persists → Reset via confirm", async ({ page }) => {
    await freshDesk(page)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    await addButton(page).click()
    const add = dialog(page, "Add to-do")
    await expect(add.getByLabel("Title")).toBeFocused()
    await expect(add.getByRole("button", { name: "Add to-do", exact: true })).toBeDisabled()
    await add.getByLabel("Title").fill("Walk the dog")
    await add.getByLabel("Note").fill("after clinic")
    await add.getByRole("button", { name: "Add to-do", exact: true }).click()
    await expect(add).toBeHidden()

    const added = todoBox(page, "Walk the dog")
    await expect(added).toBeVisible()
    await expect(todoRow(page, "Walk the dog")).toContainText("after clinic")
    await expect(todoRow(page, "Walk the dog").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(page.getByTestId("open-count")).toHaveText("6")
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(resetButton(page)).toBeEnabled()

    await added.click()
    await expect(added).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("open-count")).toHaveText("5")

    await todayList(page).getByRole("button", { name: "Edit Walk the dog", exact: true }).click()
    const edit = dialog(page, "Edit to-do")
    await expect(edit.getByLabel("Title")).toHaveValue("Walk the dog")
    await edit.getByLabel("Title").fill("Walk the puppy")
    await edit.getByRole("button", { name: "Save changes", exact: true }).click()
    await expect(edit).toBeHidden()
    await expect(todoBox(page, "Walk the puppy")).toBeVisible()

    await todayList(page).getByRole("button", { name: "Delete Look at Metrics", exact: true }).click()
    const confirm = dialog(page, "Delete this to-do?")
    await expect(confirm).toContainText("Look at Metrics")
    await confirm.getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(todoBox(page, "Look at Metrics")).toBeVisible()

    await todayList(page).getByRole("button", { name: "Delete Look at Metrics", exact: true }).click()
    await dialog(page, "Delete this to-do?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(todoBox(page, "Look at Metrics")).toHaveCount(0)

    const scratch = notes(page).getByLabel("Scratch")
    await scratch.fill("A personal thought that should persist.")
    await scratch.blur()
    await expect(page.getByTestId("scratch-status")).toContainText("Saved")
    await expect(notes(page).getByTestId("sample-data-tag")).toHaveCount(0)

    await page.reload()
    await expect(note(page)).toHaveText(NOTE.saved)
    await expect(todoBox(page, "Walk the puppy")).toHaveAttribute("aria-checked", "true")
    await expect(todoBox(page, "Look at Metrics")).toHaveCount(0)
    await expect(notes(page).getByLabel("Scratch")).toHaveValue("A personal thought that should persist.")
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(saved).toContain('"Walk the puppy"')
    expect(saved).not.toContain('"now"')

    await resetButton(page).click()
    const reset = dialog(page, "Reset demo data?")
    await reset.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(reset).toBeHidden()
    await expect(todoBox(page, "Walk the puppy")).toBeVisible()

    await resetDemoData(page, header(page))
    await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)
    await expect(todoBox(page, "Walk the puppy")).toHaveCount(0)
    await expect(todoBox(page, "Look at Metrics")).toBeVisible()
    await expect(notes(page).getByLabel("Scratch")).toHaveValue(SEED_SCRATCH)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await expect(note(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  })

  test("emptying the list shows one empty state; scratch can be emptied too", async ({ page }) => {
    await freshDesk(page)
    const titles = [
      "Call Aledo",
      "Clinic follow-up",
      "Look at Metrics",
      "Reply to Dan",
      "Text May — Dallas night",
      "Confirm Austin flight",
      "Sketch Aledo install notes",
    ]
    for (const title of titles) {
      await todayList(page).getByRole("button", { name: `Delete ${title}`, exact: true }).click()
      await dialog(page, "Delete this to-do?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(dialog(page, "Delete this to-do?")).toBeHidden()
    }
    const empty = page.getByRole("status", { name: "No to-dos", exact: true })
    await expect(empty).toContainText("Nothing on the list")
    await expect(page.getByTestId("open-count")).toHaveText("0")

    await notes(page).getByLabel("Scratch").fill("")
    await notes(page).getByLabel("Scratch").blur()
    await expect(notes(page).getByLabel("Scratch")).toHaveValue("")

    await empty.getByRole("button", { name: "Add to-do", exact: true }).click()
    const add = dialog(page, "Add to-do")
    await add.getByLabel("Title").fill("First one back")
    await add.getByRole("button", { name: "Add to-do", exact: true }).click()
    await expect(todoBox(page, "First one back")).toBeVisible()
    await expect(todoRow(page, "First one back")).toHaveAttribute("data-todo", "todo-8")

    await resetDemoData(page, header(page))
    await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)
  })

  test("the whole screen works from the keyboard: Add via Tab/Enter, check, delete", async ({ page }) => {
    await freshDesk(page)

    await header(page).getByRole("heading", { level: 1, name: "My Desk" }).click()
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab")
      const label = await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label") ?? el.textContent?.trim()}` : "none"
      })
      seen.push(label)
      if (label === "button:Add to-do") break
    }
    expect(seen.at(-1), seen.join(" | ")).toBe("button:Add to-do")
    expect(seen, seen.join(" | ")).toEqual(["button:Reset", "button:Add to-do"])
    await expect(resetButton(page)).toHaveAccessibleDescription(/nothing to reset/)

    await page.keyboard.press("Enter")
    const add = dialog(page, "Add to-do")
    await expect(add.getByLabel("Title")).toBeFocused()
    await page.keyboard.type("Keyboard to-do")
    await page.keyboard.press("Enter")
    await expect(add).toBeHidden()
    await expect(todoBox(page, "Keyboard to-do")).toBeVisible()

    await todoBox(page, "Keyboard to-do").focus()
    await page.keyboard.press("Enter")
    await expect(todoBox(page, "Keyboard to-do")).toHaveAttribute("aria-checked", "true")

    await todayList(page).getByRole("button", { name: "Delete Keyboard to-do", exact: true }).focus()
    await page.keyboard.press("Enter")
    const confirm = dialog(page, "Delete this to-do?")
    await expect(confirm).toBeVisible()
    await confirm.getByRole("button", { name: "Delete", exact: true }).focus()
    await page.keyboard.press("Enter")
    await expect(confirm).toBeHidden()
    await expect(todoBox(page, "Keyboard to-do")).toHaveCount(0)

    await resetDemoData(page, header(page))
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
    await page.goto("/my-desk")
    await expect(note(page)).toHaveText(NOTE.unsaved)

    await todoBox(page, "Call Aledo").click()
    await expect(todoBox(page, "Call Aledo")).toHaveAttribute("aria-checked", "true")
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
    await a.goto("/my-desk")
    await a.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await a.reload()
    await b.goto("/my-desk")
    await expect(note(a)).toHaveText(NOTE.unsaved)
    await expect(note(b)).toHaveText(NOTE.unsaved)
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)
    await settled(a, 0)
    await settled(b, 0)

    await todoBox(a, "Call Aledo").click()
    await expect(todoBox(b, "Call Aledo")).toHaveAttribute("aria-checked", "true")
    await expect(note(b)).toHaveText(NOTE.saved)
    await settled(a, 1)
    await settled(b, 0)

    await todayList(b).getByRole("button", { name: "Delete Clinic follow-up", exact: true }).click()
    await dialog(b, "Delete this to-do?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(todoBox(a, "Clinic follow-up")).toHaveCount(0)
    await settled(a, 1)
    await settled(b, 1)

    await resetDemoData(a, header(a))
    await expect(todayList(b).locator("[data-todo]")).toHaveCount(7)
    await expect(todoBox(b, "Call Aledo")).toHaveAttribute("aria-checked", "false")
    await expect(note(b)).toHaveText(NOTE.unsaved)
    await settled(a, 1)
    await settled(b, 1)
    expect(await a.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await context.close()
  })

  test("a corrupt saved copy renders the seed without being touched; the first real save parks it", async ({ browser }) => {
    const context = await browser.newContext()
    await countWrites(context, STORAGE_KEY)
    const page = await context.newPage()
    const junk = '{"todos":[{"id":"todo-1","title":"","done":false}],"nextId":2}'
    await page.goto("/my-desk")
    await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [STORAGE_KEY, junk] as const)
    await page.reload()
    await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)
    await expect(note(page)).toHaveText(NOTE.unsaved)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(junk)
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)
    expect(await page.evaluate((key) => localStorage.getItem(`${key}.rejected`), STORAGE_KEY)).toBeNull()

    await todoBox(page, "Call Aledo").click()
    await expect(note(page)).toHaveText(NOTE.saved)
    const parked = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(`${key}.rejected`) ?? "[]") as { raw: string; why: string }[],
      STORAGE_KEY
    )
    expect(parked).toHaveLength(1)
    expect(parked[0].why).toBe("failed validation")
    expect(parked[0].raw).toBe(junk)
    await context.close()
  })
})
