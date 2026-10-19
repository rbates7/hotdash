import { expect, type Locator } from "@playwright/test"

/** Minimum touch target below 1280 (WCAG 2.5.5 / the Deke frames). */
export const MIN_TAP = 44

/** The control is painted and at least 44 × 44. */
export async function expectTapTarget(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(MIN_TAP)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(MIN_TAP)
}
