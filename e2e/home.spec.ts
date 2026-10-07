import { expect, test, type Locator, type Page } from "@playwright/test"

test.describe("Home", () => {
  test("is the default screen and shows the day's pulse", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    // The lede is today's weekday where the founder is (Central), rendered on
    // the server from the real clock — not a frozen demo instant.
    const weekday = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "America/Chicago",
    })
    await expect(page.getByText(`${weekday} pulse`)).toBeVisible()

    // Sidebar marks Home as the current page.
    const rail = page.locator('[data-slot="sidebar"]').first()
    await expect(rail.getByRole("link", { name: "Home" })).toHaveAttribute("data-active")
    await expect(rail.getByRole("link", { name: "Metrics" })).not.toHaveAttribute("data-active")

    // #1 strip.
    const one = page.getByRole("region", { name: "Number one" })
    await expect(one.getByRole("heading", { level: 2, name: "Call Aledo before Friday" })).toBeVisible()
    await expect(one.getByRole("link", { name: "My Desk" })).toHaveAttribute("href", "/my-desk")

    // Truth strip: paying coaches + cash this week, each stamped as sample.
    const kpis = page.getByRole("region", { name: "KPI strip" })
    await expect(kpis.getByRole("heading", { name: "Truth strip" })).toBeVisible()
    await expect(kpis.getByRole("article")).toHaveText([/Paying coaches/, /Cash this week/])
    await expect(kpis.getByText("186")).toBeVisible()
    await expect(kpis.getByText("$4,860")).toBeVisible()
    await expect(kpis.getByTestId("kpi-sample-chip")).toHaveCount(2)

    // Home reads the Workplace's browser-saved board and says so.
    await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")

    // Doors.
    const doors = page.getByRole("group", { name: "Doors" })
    await expect(doors.getByRole("region")).toHaveCount(3)
    await expect(doors.getByText("3 agents working")).toBeVisible()
    await expect(doors.getByText("2 waiting")).toBeVisible()
    await expect(doors.getByRole("list", { name: "Needs you" }).getByRole("link")).toHaveCount(3)
  })

  test("a Needs-you row opens its ticket in the Workplace Inbox", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: /Agent blocked/ }).click()
    await expect(page).toHaveURL(/\/agent-workplace\?tab=inbox&issue=CHLK-412$/)
    await expect(page.getByRole("heading", { level: 1, name: "Refund path for annual seats" })).toBeVisible()
  })

  test("the dev board door opens the board", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Open Agent Workplace" }).click()
    await expect(page).toHaveURL(/\/agent-workplace$/)
    await expect(page.getByRole("region", { name: "To Do" })).toBeVisible()
  })

  test("reflects the board: closing the linked tickets clears Needs you", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByText("2 waiting")).toBeVisible()

    // The three Needs-you rows and the column each ticket currently sits in.
    const linked = [
      ["CHLK-408", "In Review"],
      ["CHLK-412", "Blocked"],
      ["CHLK-406", "In Progress"],
    ] as const
    for (const [key, status] of linked) {
      await page.goto(`/agent-workplace?issue=${key}`)
      await page.getByRole("button", { name: status, exact: true }).click()
      await page.getByRole("button", { name: "Done", exact: true }).click()
      await page.keyboard.press("Escape")
      await expect(
        page.locator('[data-slot="popover-trigger"]').filter({ hasText: /^Done$/ })
      ).toBeVisible()
    }

    await page.goto("/home")
    const inbox = page.getByRole("region", { name: "Inbox" })
    await expect(inbox.getByText("Nothing needs you")).toBeVisible()
    await expect(inbox.getByText(/waiting/)).toHaveCount(0)

    // The Workplace Inbox agrees: only the dismissed digest is left.
    await page.goto("/agent-workplace?tab=inbox")
    const panel = page.getByRole("tabpanel", { name: "Inbox" })
    await expect(panel.getByRole("listitem")).toHaveCount(1)
    await expect(panel.getByText("Daily standup summary")).toBeVisible()

    // Reset the browser copy so other tests see the seed.
    await page.goto("/agent-workplace")
    await page.getByRole("button", { name: "Reset" }).click()
    await page.goto("/home")
    await expect(page.getByText("2 waiting")).toBeVisible()
  })

  test("renders in light and dark, with readable sample-data labels on the strip and every card", async ({ page }) => {
    await page.goto("/home")
    const label = page.getByTestId("kpi-sample-label")
    const chips = page.getByTestId("kpi-sample-chip")
    await expect(chips).toHaveCount(2)

    for (const theme of ["Light", "Dark"] as const) {
      await page.getByText(theme, { exact: true }).click()
      await expect(page.locator("html")).toHaveClass(
        theme === "Dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
      )
      await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()

      await expect(label).toBeVisible()
      await expect(label).toContainText("Sample data")
      expect(await contrastRatio(page, label), `${theme} strip label`).toBeGreaterThanOrEqual(4.5)

      for (const chip of await chips.all()) {
        await expect(chip).toBeVisible()
        await expect(chip).toHaveText("Sample data")
        expect(await contrastRatio(page, chip), `${theme} card chip`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

/**
 * WCAG contrast of an element's text against what is actually painted
 * behind it: its own background composited over the nearest opaque ancestor
 * background, so translucent dark-mode chips are measured honestly.
 */
async function contrastRatio(page: Page, locator: Locator) {
  return locator.evaluate((el) => {
    // Computed colours arrive as oklch()/color(srgb …) under Tailwind v4;
    // painting a pixel is the one parser that understands every syntax.
    const ctx = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    })!
    const parse = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    type Rgb = { r: number; g: number; b: number }
    const over = (top: ReturnType<typeof parse>, under: Rgb): Rgb => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: Rgb) => {
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }

    // Walk up from the element compositing every backdrop until one is opaque.
    const layers: ReturnType<typeof parse>[] = []
    let node: Element | null = el
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor)
      if (bg.a > 0) layers.push(bg)
      if (bg.a >= 1) break
      node = node.parentElement
    }
    let backdrop: Rgb = { r: 255, g: 255, b: 255 }
    for (const layer of layers.reverse()) backdrop = over(layer, backdrop)

    const fg = parse(getComputedStyle(el).color)
    const text = over(fg, backdrop)
    const [l1, l2] = [lum(text), lum(backdrop)].sort((a, b) => b - a)
    return (l1 + 0.05) / (l2 + 0.05)
  })
}
