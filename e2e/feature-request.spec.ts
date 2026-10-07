import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { NOTE, NOTE_NAME, countWrites, expectWritesSettled, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

const STORAGE_KEY = "hotdash.feature-requests.v1"
const REJECTED_KEY = `${STORAGE_KEY}.rejected`
const MOVE = "Move to On Roadmap"

// Every role lookup below is scoped by name, directly or through a named
// ancestor, so nothing else on the page can ever match by accident.
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const board = (page: Page) => page.getByRole("region", { name: "Feature request intake", exact: true })
const card = (page: Page, title: string) =>
  board(page).getByRole("button", { name: `Open idea: ${title}`, exact: true })
const actions = (page: Page) => page.getByRole("group", { name: "Page actions", exact: true })
const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const newIdea = (page: Page) => actions(page).getByRole("button", { name: "New idea", exact: true })
const resetButton = (page: Page) => actions(page).getByRole("button", { name: "Reset", exact: true })
const cardsIn = (page: Page, name: string) =>
  column(page, name).getByRole("button", { name: /^Open idea:/ })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const sampleNote = (page: Page) => page.getByRole("note", { name: "Sample data" })
const headerTag = (page: Page) => actions(page).getByTestId("sample-data-tag")
const cardTags = (page: Page) => board(page).getByTestId("sample-data-tag")
// The shared note is a `status` live region normally and an `alert` once a save failed.
const persistence = (page: Page, { failed = false } = {}) =>
  actions(page).getByRole(failed ? "alert" : "status", { name: NOTE_NAME, exact: true })
const RESET_DISABLED_HINT = "Nothing is saved in this browser yet, so there is nothing to reset."

const savedCopy = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)

async function freshBoard(page: Page) {
  await page.goto("/feature-request")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  // Hydrated, but nothing of the founder's to save yet.
  await expect(persistence(page)).toHaveText(NOTE.unsaved)
}

test.describe("Feature Request", () => {
  test("is reachable from the sidebar and shows the four-column intake", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "Feature Request", exact: true }).click()
    await expect(page).toHaveURL(/\/feature-request$/)
    const main = page.getByRole("main")
    await expect(main.getByRole("heading", { level: 1, name: "Feature Request" })).toBeVisible()
    await expect(main.getByText("Dan’s intake · funnels into Product Roadmap")).toBeVisible()
    await expect(persistence(page)).toHaveText(/save[ds]? in this browser/)

    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(cardsIn(page, "Triaged")).toHaveCount(3)
    await expect(cardsIn(page, "On Roadmap")).toHaveCount(2)
    await expect(cardsIn(page, "Parked")).toHaveCount(2)
    await expect(column(page, "Inbox").getByRole("heading", { level: 2, name: "Inbox" })).toBeVisible()
    await expect(card(page, "Play of the Day")).toContainText("Pin one ready-to-run play")
    await expect(card(page, "Play of the Day")).toContainText("Dan")
    await expect(newIdea(page)).toBeVisible()
  })

  test("labels every seed card as sample data, in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(sampleNote(page)).toBeVisible()
      await expect(sampleNote(page)).toContainText("invented examples")
      await expect(headerTag(page)).toHaveText("Sample data")
      await expect(cardTags(page)).toHaveCount(10)
      for (const title of ["Play of the Day", "Custom play headers", "Play share links", "Parent recap emails"]) {
        const tag = card(page, title).getByTestId("sample-data-tag")
        await expect(tag).toBeVisible()
        await expect(tag).toHaveText("Sample data")
      }
    }
    await setTheme(page, "dark")
  })

  test("every text node in the sample-data labels clears 4.5:1, in both themes (shared probe)", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(sampleNote(page), `${theme}/notice`, expect)
      await expectReadable(headerTag(page), `${theme}/header tag`, expect)
      const tags = cardTags(page)
      await expect(tags).toHaveCount(10)
      for (const tag of await tags.all()) await expectReadable(tag, `${theme}/card tag`, expect)
    }
    await setTheme(page, "dark")
  })

  test("negative control: the shared probe fails on unreadable text, in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectProbeCatchesSabotage(sampleNote(page), `${theme}/notice`, expect)
      await expectProbeCatchesSabotage(card(page, "Play of the Day").getByTestId("sample-data-tag"), `${theme}/card tag`, expect)
    }
    await setTheme(page, "dark")
  })

  test("Reset is disabled until something is saved, and asks before it acts", async ({ page }) => {
    await freshBoard(page)
    const reset = resetButton(page)
    await expect(reset).toHaveAttribute("aria-disabled", "true")
    await expect(reset).toHaveAttribute("title", RESET_DISABLED_HINT)
    const styles = () =>
      reset.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { background: cs.backgroundColor, color: cs.color, cursor: cs.cursor, opacity: cs.opacity }
      })
    const before = await styles()
    expect(before.cursor).toBe("not-allowed")
    expect(Number(before.opacity)).toBeCloseTo(0.5, 2)
    await reset.hover()
    expect(await styles()).toEqual(before)

    await card(page, "Play of the Day").click()
    const d = dialog(page, "Idea: Play of the Day")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Parked", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(d).toBeHidden()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    await expect(reset).not.toHaveAttribute("aria-disabled", "true")

    await reset.click()
    const confirm = page.getByRole("dialog", { name: "Reset demo data?" })
    await expect(confirm).toBeVisible()
    await confirm.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(cardsIn(page, "Parked")).toHaveCount(3)
    expect(await savedCopy(page)).toContain('"status":"parked"')

    await resetDemoData(page, actions(page))
    await expect(cardsIn(page, "Parked")).toHaveCount(2)
    expect(await savedCopy(page)).toBeNull()
    await expect(reset).toHaveAttribute("aria-disabled", "true")
  })

  test("says so when the browser refuses to save, and keeps the idea on the board", async ({ page }) => {
    // Simulate quota / private mode for this key only.
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new DOMException("quota", "QuotaExceededError")
        return original.call(this, k, v)
      }
    }, STORAGE_KEY)
    await freshBoard(page)
    await newIdea(page).click()
    const d = dialog(page, "New idea")
    await d.getByRole("textbox", { name: "Idea title" }).fill("Won't fit")
    await d.getByRole("button", { name: /Add idea/ }).click()
    await expect(d).toBeHidden()
    await expect(card(page, "Won't fit")).toBeVisible()
    await expect(persistence(page, { failed: true })).toHaveText(NOTE.failed)
    expect(await savedCopy(page)).toBeNull()
    await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  })

  test("follows another tab's edits and resets through the storage event, and the writes settle", async ({ context, page }) => {
    // Count every write to the key in both tabs. A hydrate must never save,
    // so after one edit exactly one write exists across the pair.
    await countWrites(context, STORAGE_KEY)
    // Counted after the other tab has visibly taken the change (web-first),
    // then must stay flat over a quiet window: a loop would move the count
    // and the poll would never settle.
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)

    await freshBoard(page)
    const other = await context.newPage()
    await other.goto("/feature-request")
    await expect(persistence(other)).toHaveText(NOTE.unsaved)
    await settled(page, 0)
    await settled(other, 0)

    await newIdea(other).click()
    await dialog(other, "New idea").getByRole("textbox", { name: "Idea title" }).fill("From tab two")
    await dialog(other, "New idea").getByRole("button", { name: /Add idea/ }).click()
    await expect(card(page, "From tab two")).toBeVisible()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    await expect(persistence(other)).toHaveText(NOTE.saved)

    // One write in the editing tab; the listening tab never echoes.
    await settled(other, 1)
    await settled(page, 0)

    // The first tab edits in turn: one more write, still no echo from the second.
    await card(page, "From tab two").click()
    const d = dialog(page, "Idea: From tab two")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Parked", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(column(other, "Parked").getByRole("button", { name: "Open idea: From tab two", exact: true })).toBeVisible()
    await settled(page, 1)
    await settled(other, 1)

    // Reset there: this tab re-seeds and forgets it edited anything.
    await resetDemoData(other, actions(other))
    await expect(card(page, "From tab two")).toHaveCount(0)
    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(persistence(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
    await settled(page, 1)
    await settled(other, 1)
    await other.close()
  })

  test("does not write the untouched seed; the first edit does", async ({ page }) => {
    await freshBoard(page)
    expect(await savedCopy(page)).toBeNull()
    await page.reload()
    await expect(persistence(page)).toHaveText(NOTE.unsaved)
    expect(await savedCopy(page)).toBeNull()

    await card(page, "Play of the Day").click()
    const d = dialog(page, "Idea: Play of the Day")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Triaged", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(d).toBeHidden()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    expect(await savedCopy(page)).toContain('"status":"triaged"')
  })

  test("falls back to the seed when the saved copy has a bad item", async ({ page }) => {
    await page.goto("/feature-request")
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          nextId: 3,
          requests: [
            { id: "fr-1", title: "Fine", ask: "", from: "Dan", status: "inbox", createdAt: "2026-08-24T15:00:00.000Z", updatedAt: "2026-08-24T15:00:00.000Z" },
            { id: "fr-2", title: "Broken", ask: "", from: "Dan", status: "shipped", createdAt: "2026-08-24T15:00:00.000Z", updatedAt: "2026-08-24T15:00:00.000Z" },
          ],
        })
      )
    }, STORAGE_KEY)
    await page.reload()
    await expect(persistence(page)).toHaveText(NOTE.unsaved)
    await expect(card(page, "Fine")).toHaveCount(0)
    await expect(cardTags(page)).toHaveCount(10)
    // load() is pure: the bad copy is still under the live key and nothing
    // is parked yet. The first real save parks it (newest first, with a
    // reason) and writes the clean copy over it.
    const parked = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "[]") as { raw: string; why: string }[],
        REJECTED_KEY
      )
    expect(await savedCopy(page)).toContain('"Broken"')
    expect(await parked()).toEqual([])

    await card(page, "Play of the Day").click()
    const d = dialog(page, "Idea: Play of the Day")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Parked", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    expect(await savedCopy(page)).not.toContain('"Broken"')
    const rejected = await parked()
    expect(rejected).toHaveLength(1)
    expect(rejected[0].raw).toContain('"Broken"')
    expect(rejected[0].why).toBe("failed validation")
  })

  test("adds an idea, reloads, and it is still there; Reset clears it", async ({ page }) => {
    await freshBoard(page)
    await newIdea(page).click()
    const d = dialog(page, "New idea")
    await d.getByRole("textbox", { name: "Idea title" }).fill("Practice plan templates")
    await d.getByRole("textbox", { name: "The ask" }).fill("Reusable weekly plans a coach can tweak.")
    await expect(d.getByRole("textbox", { name: "From" })).toHaveValue("Dan")
    await d.getByRole("button", { name: /Add idea/ }).click()
    await expect(d).toBeHidden()

    await expect(cardsIn(page, "Inbox")).toHaveCount(4)
    await expect(cardsIn(page, "Inbox").first()).toHaveAccessibleName("Open idea: Practice plan templates")
    await expect(card(page, "Practice plan templates").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(persistence(page)).toHaveText(NOTE.saved)

    await page.reload()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    await expect(cardsIn(page, "Inbox")).toHaveCount(4)
    await expect(card(page, "Practice plan templates")).toContainText("Reusable weekly plans a coach can tweak.")

    await resetDemoData(page, actions(page))
    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(card(page, "Practice plan templates")).toHaveCount(0)
    await expect(persistence(page)).toHaveText(NOTE.unsaved)
    expect(await savedCopy(page)).toBeNull()
    await expect(resetButton(page)).toHaveAttribute("aria-disabled", "true")
  })

  test("edits a card, moves it between columns, and the edit survives reload", async ({ page }) => {
    await freshBoard(page)
    await card(page, "Web import from a link").click()
    const d = dialog(page, "Idea: Web import from a link")
    // Shared formatRelative long: two days back reads as a weekday date.
    await expect(d.getByText(/^Added/)).toContainText(/^Added \w{3}, \w{3} \d{1,2}$/)
    await expect(d.getByRole("button", { name: /Save/ })).toBeDisabled()

    await d.getByRole("textbox", { name: "Idea title" }).fill("Import a play from a HUDL link")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Triaged", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(d).toBeHidden()

    const moved = column(page, "Triaged").getByRole("button", { name: "Open idea: Import a play from a HUDL link" })
    await expect(moved).toBeVisible()
    await expect(moved.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(cardsIn(page, "Inbox")).toHaveCount(2)
    await expect(sampleNote(page)).toContainText("9 cards")

    await page.reload()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    await expect(column(page, "Triaged").getByRole("button", { name: "Open idea: Import a play from a HUDL link" })).toBeVisible()
    await expect(cardsIn(page, "Inbox")).toHaveCount(2)
  })

  test("Move to On Roadmap only moves the card on this board, and says so", async ({ page }) => {
    await freshBoard(page)
    await card(page, "Custom play headers").click()
    const d = dialog(page, "Idea: Custom play headers")
    await expect(d).toContainText("Moves the card to the On Roadmap column on this board. The Product Roadmap page isn't wired yet, so nothing is sent anywhere.")
    await d.getByRole("button", { name: MOVE, exact: true }).click()
    await expect(d).toBeHidden()

    const moved = column(page, "On Roadmap").getByRole("button", { name: "Open idea: Custom play headers" })
    await expect(moved).toBeVisible()
    await expect(moved.getByText("Roadmap", { exact: true })).toHaveAttribute("title", /isn't wired yet/)
    await expect(cardsIn(page, "On Roadmap")).toHaveCount(3)

    await moved.click()
    await expect(dialog(page, "Idea: Custom play headers")).toContainText("On Roadmap here only.")
    await expect(dialog(page, "Idea: Custom play headers").getByRole("button", { name: MOVE })).toHaveCount(0)
    await page.keyboard.press("Escape")
  })

  test("shows an empty board with no sample labels when every card is gone", async ({ page }) => {
    await page.goto("/feature-request")
    await page.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ requests: [], nextId: 1 })),
      STORAGE_KEY
    )
    await page.reload()
    await expect(persistence(page)).toHaveText(NOTE.saved)
    await expect(page.getByRole("status", { name: "Empty board" })).toContainText("Nothing on the board")
    for (const name of ["Inbox", "Triaged", "On Roadmap", "Parked"]) {
      await expect(column(page, name)).toContainText(`Nothing in ${name}`)
    }
    await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(sampleNote(page)).toHaveCount(0)

    await resetDemoData(page, actions(page))
    await expect(cardTags(page)).toHaveCount(10)
  })
})
