import { expect, type Page } from "@playwright/test"

import { APP_HEADER_NAME } from "../../src/components/app-header"

/** Segmented Light/Dark group in an expanded rail or overlay drawer. */
export function themeToggle(page: Page) {
  return page.getByRole("region", { name: "Appearance" }).getByRole("group", { name: "Theme" })
}

/**
 * Switch theme through the real provider (not a query param) and wait for
 * <html> to carry the class. Phone top bar and the tablet icon rail use the
 * icon button; the expanded rail keeps the segmented control.
 */
export async function setTheme(page: Page, theme: "light" | "dark") {
  const html = page.locator("html")
  const expected = theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  const already =
    theme === "dark"
      ? await html.evaluate((el) => el.classList.contains("dark"))
      : await html.evaluate((el) => !el.classList.contains("dark"))
  if (already) {
    await expect(html).toHaveClass(expected)
    return
  }

  const segmented = themeToggle(page).getByRole("button", {
    name: theme === "dark" ? "Dark" : "Light",
    exact: true,
  })
  const headerIcon = page
    .getByRole("region", { name: APP_HEADER_NAME })
    .getByRole("button", { name: `Switch to ${theme} theme` })
  const railIcon = page
    .getByRole("region", { name: "Appearance" })
    .getByRole("button", { name: `Switch to ${theme} theme` })

  await expect(segmented.or(headerIcon).or(railIcon).first()).toBeVisible()
  if (await segmented.isVisible()) {
    await segmented.click()
  } else if (await headerIcon.isVisible()) {
    await headerIcon.click()
  } else {
    await railIcon.click()
  }
  await expect(html).toHaveClass(expected)
}
