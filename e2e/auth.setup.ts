import { expect, test as setup } from "@playwright/test"

import { signInThroughForm } from "./support/auth"
import { SIGNED_IN_STATE } from "./support/test-credentials"

setup("sign in as the founder", async ({ page }) => {
  await page.goto("/sign-in")
  await signInThroughForm(page)
  // Generous: under `next dev` this is the first compile of /home.
  await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 })
  await page.context().storageState({ path: SIGNED_IN_STATE })
})
