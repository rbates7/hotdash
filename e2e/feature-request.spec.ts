import { expect, test, type Page } from "@playwright/test"

import { measureSampleDataText } from "./feature-request.contrast"

const STORAGE_KEY = "hotdash.feature-requests.v1"
const REJECTED_KEY = `${STORAGE_KEY}.rejected`
const MOVE = "Move to On Roadmap"

// Every role lookup below is scoped by name, directly or through a named
// ancestor, so nothing else on the page can ever match by accident.
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) =>
  page.getByRole("button", { name: `Open idea: ${title}`, exact: true })
const cardsIn = (page: Page, name: string) =>
  column(page, name).getByRole("button", { name: /^Open idea:/ })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const sampleNote = (page: Page) => page.getByRole("note", { name: "Sample data" })
const persistence = (page: Page) => page.getByTestId("persistence-note")

const savedCopy = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)

async function freshBoard(page: Page) {
  await page.goto("/feature-request")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  // Hydrated, but nothing of the founder's to save yet.
  await expect(persistence(page)).toHaveText("Edits save in this browser")
}

/** Reset asks first: click it, then confirm. */
async function resetBoard(page: Page) {
  await page.getByRole("button", { name: "Reset", exact: true }).click()
  await page.getByRole("button", { name: "Confirm reset", exact: true }).click()
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

test.describe("Feature Request", () => {
  test("is reachable from the sidebar and shows the four-column intake", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Feature Request", exact: true }).click()
    await expect(page).toHaveURL(/\/feature-request$/)
    await expect(page.getByRole("heading", { level: 1, name: "Feature Request" })).toBeVisible()
    await expect(page.getByText("Dan’s intake · funnels into Product Roadmap")).toBeVisible()
    await expect(persistence(page)).toHaveText(/save[ds]? in this browser/)

    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(cardsIn(page, "Triaged")).toHaveCount(3)
    await expect(cardsIn(page, "On Roadmap")).toHaveCount(2)
    await expect(cardsIn(page, "Parked")).toHaveCount(2)
    await expect(column(page, "Inbox").getByRole("heading", { level: 2, name: "Inbox" })).toBeVisible()
    await expect(card(page, "Play of the Day")).toContainText("Pin one ready-to-run play")
    await expect(card(page, "Play of the Day")).toContainText("Dan")
    await expect(page.getByRole("button", { name: "New idea", exact: true })).toBeVisible()
  })

  test("labels every seed card as sample data, in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(sampleNote(page)).toBeVisible()
      await expect(sampleNote(page)).toContainText("invented examples")
      await expect(page.getByTestId("sample-data-badge")).toHaveText("Sample data")
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(10)
      for (const title of ["Play of the Day", "Custom play headers", "Play share links", "Parent recap emails"]) {
        const tag = card(page, title).getByTestId("sample-data-tag")
        await expect(tag).toBeVisible()
        await expect(tag).toHaveText("Sample data")
      }
    }
    await setTheme(page, "dark")
  })

  test("every text node in the sample-data labels clears 4.5:1, in both themes, with no opacity", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const nodes = await measureSampleDataText(page)
      // 10 tags + the badge + the notice's text nodes.
      expect(nodes.filter((n) => n.label === "sample-data-tag")).toHaveLength(10)
      expect(nodes.filter((n) => n.label === "sample-data-badge")).toHaveLength(1)
      expect(nodes.filter((n) => n.label === "sample-data-notice").length).toBeGreaterThanOrEqual(2)
      for (const n of nodes) {
        const where = `${theme} · ${n.label} · "${n.text}"`
        expect(n.textAlpha, `${where}: text colour must be opaque`).toBe(1)
        expect(n.opacity, `${where}: no opacity on the text`).toBe(1)
        expect(n.ratio, `${where}: contrast ${n.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    }
    await setTheme(page, "dark")
  })

  test("negative control: the contrast probe fails on low contrast and on translucent text", async ({ page }) => {
    await freshBoard(page)
    // Push the tag text towards its background in each theme, fade the
    // badge, and make the notice's bold text translucent.
    const sabotage = {
      light: "rgb(230 210 150)", // close to amber-100
      dark: "rgb(100 60 20)", // close to amber-950
    } as const
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const before = await measureSampleDataText(page)
      expect(before.every((n) => n.ratio >= 4.5 && n.textAlpha === 1 && n.opacity === 1)).toBe(true)

      const style = await page.addStyleTag({
        content: `
          [data-testid="sample-data-tag"] { color: ${sabotage[theme]} !important; }
          [data-testid="sample-data-badge"] { opacity: 0.6 !important; }
          [role="note"][aria-label="Sample data"] strong { color: rgb(0 0 0 / 0.5) !important; }
        `,
      })
      const after = await measureSampleDataText(page)
      const tags = after.filter((n) => n.label === "sample-data-tag")
      expect(tags).toHaveLength(10)
      for (const n of tags) {
        expect(n.ratio, `${theme} tag "${n.text}" ${n.ratio.toFixed(2)}:1`).toBeLessThan(4.5)
      }
      const badge = after.find((n) => n.label === "sample-data-badge")!
      expect(badge.opacity).toBeCloseTo(0.6, 5)
      // React renders the <strong> as two text nodes, "Sample data" and ".".
      const strong = after.filter((n) => n.label === "sample-data-notice" && n.text === "Sample data")
      expect(strong).toHaveLength(1)
      expect(strong[0].textAlpha).toBeLessThan(1)
      await style.evaluate((el) => (el as HTMLElement).remove())
    }
    await setTheme(page, "dark")
  })

  test("Reset is disabled until something is saved, and asks before it acts", async ({ page }) => {
    await freshBoard(page)
    const reset = page.getByRole("button", { name: "Reset", exact: true })
    await expect(reset).toBeDisabled()
    await expect(reset).toHaveAttribute("title", "Nothing is saved in this browser yet")

    await card(page, "Play of the Day").click()
    const d = dialog(page, "Idea: Play of the Day")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Parked", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(d).toBeHidden()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(reset).toBeEnabled()

    await reset.click()
    await expect(page.getByRole("button", { name: "Confirm reset", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Keep edits", exact: true }).click()
    await expect(cardsIn(page, "Parked")).toHaveCount(3)
    expect(await savedCopy(page)).toContain('"status":"parked"')

    await resetBoard(page)
    await expect(cardsIn(page, "Parked")).toHaveCount(2)
    expect(await savedCopy(page)).toBeNull()
    await expect(reset).toBeDisabled()
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
    await page.getByRole("button", { name: "New idea", exact: true }).click()
    const d = dialog(page, "New idea")
    await d.getByRole("textbox", { name: "Idea title" }).fill("Won't fit")
    await d.getByRole("button", { name: /Add idea/ }).click()
    await expect(d).toBeHidden()
    await expect(card(page, "Won't fit")).toBeVisible()
    await expect(persistence(page)).toHaveText("Couldn't save in this browser")
    await expect(persistence(page)).toHaveAttribute("role", "alert")
    expect(await savedCopy(page)).toBeNull()
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled()
  })

  test("follows another tab's edits and resets through the storage event", async ({ context, page }) => {
    await freshBoard(page)
    const other = await context.newPage()
    await other.goto("/feature-request")
    await expect(persistence(other)).toHaveText("Edits save in this browser")

    await other.getByRole("button", { name: "New idea", exact: true }).click()
    await dialog(other, "New idea").getByRole("textbox", { name: "Idea title" }).fill("From tab two")
    await dialog(other, "New idea").getByRole("button", { name: /Add idea/ }).click()
    await expect(card(page, "From tab two")).toBeVisible()
    await expect(persistence(page)).toHaveText("Saved in this browser")

    await resetBoard(other)
    await expect(card(page, "From tab two")).toHaveCount(0)
    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    await other.close()
  })

  test("does not write the untouched seed; the first edit does", async ({ page }) => {
    await freshBoard(page)
    expect(await savedCopy(page)).toBeNull()
    await page.reload()
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    expect(await savedCopy(page)).toBeNull()

    await card(page, "Play of the Day").click()
    const d = dialog(page, "Idea: Play of the Day")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Triaged", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(d).toBeHidden()
    await expect(persistence(page)).toHaveText("Saved in this browser")
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
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    await expect(card(page, "Fine")).toHaveCount(0)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(10)
    // The bad copy is parked verbatim, and the live key is untouched until an edit.
    const raw = await savedCopy(page)
    expect(raw).toContain('"Broken"')
    expect(await page.evaluate((key) => localStorage.getItem(key), REJECTED_KEY)).toBe(raw)

    await card(page, "Play of the Day").click()
    const d = dialog(page, "Idea: Play of the Day")
    await d.getByRole("group", { name: "Status" }).getByRole("button", { name: "Parked", exact: true }).click()
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    expect(await savedCopy(page)).not.toContain('"Broken"')
    expect(await page.evaluate((key) => localStorage.getItem(key), REJECTED_KEY)).toBe(raw)
  })

  test("adds an idea, reloads, and it is still there; Reset clears it", async ({ page }) => {
    await freshBoard(page)
    await page.getByRole("button", { name: "New idea", exact: true }).click()
    const d = dialog(page, "New idea")
    await d.getByRole("textbox", { name: "Idea title" }).fill("Practice plan templates")
    await d.getByRole("textbox", { name: "The ask" }).fill("Reusable weekly plans a coach can tweak.")
    await expect(d.getByRole("textbox", { name: "From" })).toHaveValue("Dan")
    await d.getByRole("button", { name: /Add idea/ }).click()
    await expect(d).toBeHidden()

    await expect(cardsIn(page, "Inbox")).toHaveCount(4)
    await expect(cardsIn(page, "Inbox").first()).toHaveAccessibleName("Open idea: Practice plan templates")
    await expect(card(page, "Practice plan templates").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(persistence(page)).toHaveText("Saved in this browser")

    await page.reload()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(cardsIn(page, "Inbox")).toHaveCount(4)
    await expect(card(page, "Practice plan templates")).toContainText("Reusable weekly plans a coach can tweak.")

    await resetBoard(page)
    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(card(page, "Practice plan templates")).toHaveCount(0)
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    expect(await savedCopy(page)).toBeNull()
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled()
  })

  test("edits a card, moves it between columns, and the edit survives reload", async ({ page }) => {
    await freshBoard(page)
    await card(page, "Web import from a link").click()
    const d = dialog(page, "Idea: Web import from a link")
    await expect(d).toContainText("Added 2 days ago")
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
    await expect(persistence(page)).toHaveText("Saved in this browser")
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
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(page.getByRole("status", { name: "Empty board" })).toContainText("Nothing on the board")
    for (const name of ["Inbox", "Triaged", "On Roadmap", "Parked"]) {
      await expect(column(page, name)).toContainText(`Nothing in ${name}`)
    }
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(page.getByTestId("sample-data-badge")).toHaveCount(0)
    await expect(sampleNote(page)).toHaveCount(0)

    await resetBoard(page)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(10)
  })
})
