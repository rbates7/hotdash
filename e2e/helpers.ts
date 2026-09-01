import { expect, type Page } from "@playwright/test"

export const E2E_PASSWORD = "e2e-pass"

export async function login(page: Page) {
  await page
    .context()
    .request.post("/api/auth/login", { data: { password: E2E_PASSWORD } })
}

// Retries the shortcut until the palette answers — a press that lands
// before hydration attaches the listener is simply re-sent.
export async function openPalette(page: Page) {
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k")
    await expect(
      page.getByPlaceholder("Search cases and contacts…", { exact: false })
    ).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}
