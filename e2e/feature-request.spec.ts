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

async function freshBoard(page: Page) {
  await page.goto("/feature-request")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(persistence(page)).toHaveText("Saved in this browser")
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
    await expect(persistence(page)).toHaveText("Saved in this browser")

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
