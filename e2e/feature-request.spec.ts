import { expect, test, type Page } from "@playwright/test"

const STORAGE_KEY = "hotdash.feature-requests.v1"

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

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

type TextContrast = {
  label: string
  text: string
  ratio: number
  textAlpha: number
  opacity: number
}

/**
 * WCAG contrast of every text node inside the sample-data labels, measured
 * in the browser: the node's computed colour against its *effective*
 * background (ancestor backgrounds composited until opaque). Any colour
 * syntax works because each value is rasterised through a canvas first.
 */
async function measureSampleDataText(page: Page): Promise<TextContrast[]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    const toRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    // `top` over `under`, both straight (non-premultiplied) RGBA.
    const over = (
      top: [number, number, number, number],
      under: [number, number, number, number]
    ): [number, number, number, number] => {
      const a = top[3] + under[3] * (1 - top[3])
      if (a === 0) return [0, 0, 0, 0]
      const ch = (i: number) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a
      return [ch(0), ch(1), ch(2), a]
    }
    const luminance = ([r, g, b]: number[]) => {
      const lin = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    const effectiveBackground = (start: Element) => {
      let acc: [number, number, number, number] = [0, 0, 0, 0]
      for (let el: Element | null = start; el && acc[3] < 1; el = el.parentElement) {
        acc = over(acc, toRgba(getComputedStyle(el).backgroundColor))
      }
      return over(acc, [255, 255, 255, 1])
    }
    const chainOpacity = (start: Element) => {
      let o = 1
      for (let el: Element | null = start; el; el = el.parentElement) {
        o *= Number(getComputedStyle(el).opacity)
      }
      return o
    }

    const roots = [
      ...document.querySelectorAll(
        '[data-testid="sample-data-tag"], [data-testid="sample-data-badge"], [role="note"][aria-label="Sample data"]'
      ),
    ]
    const out: TextContrast[] = []
    for (const root of roots) {
      const label = root.getAttribute("data-testid") ?? "sample-data-notice"
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? ""
        if (!text) continue
        const el = node.parentElement!
        const fg = toRgba(getComputedStyle(el).color)
        const bg = effectiveBackground(el)
        const l1 = luminance(fg)
        const l2 = luminance(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        out.push({ label, text, ratio, textAlpha: fg[3], opacity: chainOpacity(el) })
      }
    }
    return out
  })
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

    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(cardsIn(page, "Inbox")).toHaveCount(3)
    await expect(card(page, "Practice plan templates")).toHaveCount(0)
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    expect(await savedCopy(page)).toBeNull()
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

  test("Send to Roadmap only moves the card on this board, and says so", async ({ page }) => {
    await freshBoard(page)
    await card(page, "Custom play headers").click()
    const d = dialog(page, "Idea: Custom play headers")
    await expect(d).toContainText("The Product Roadmap page isn't wired yet, so nothing is sent anywhere.")
    await d.getByRole("button", { name: "Send to Roadmap", exact: true }).click()
    await expect(d).toBeHidden()

    const moved = column(page, "On Roadmap").getByRole("button", { name: "Open idea: Custom play headers" })
    await expect(moved).toBeVisible()
    await expect(moved.getByText("Roadmap", { exact: true })).toHaveAttribute("title", /isn't wired yet/)
    await expect(cardsIn(page, "On Roadmap")).toHaveCount(3)

    await moved.click()
    await expect(dialog(page, "Idea: Custom play headers")).toContainText("On Roadmap here only.")
    await expect(dialog(page, "Idea: Custom play headers").getByRole("button", { name: "Send to Roadmap" })).toHaveCount(0)
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

    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(10)
  })
})
