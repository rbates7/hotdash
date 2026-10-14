import type { Page } from "@playwright/test"

import { TEST_ADMIN_EMAIL, TEST_PASSWORD } from "./test-credentials"

export const emailField = (page: Page) => page.getByLabel("Email", { exact: true })
export const passwordField = (page: Page) => page.getByLabel("Password", { exact: true })
export const signInButton = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true })

/** Fill and submit the /sign-in form (the page must already be open). */
export async function signInThroughForm(
  page: Page,
  { email = TEST_ADMIN_EMAIL, password = TEST_PASSWORD } = {}
) {
  await emailField(page).fill(email)
  await passwordField(page).fill(password)
  await signInButton(page).click()
}
