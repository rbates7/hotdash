import { expect, type Page } from "@playwright/test"

/** The Light/Dark control: a named group inside the sidebar's "Appearance" region. */
export function themeToggle(page: Page) {
  return page.getByRole("region", { name: "Appearance" }).getByRole("group", { name: "Theme" })
}

/**
 * Switch theme through the real provider (the sidebar control, not a query
 * param), scoped to its landmark, and wait for <html> to carry the class.
 */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await themeToggle(page)
    .getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true })
    .click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}
