import { expect, test } from "@playwright/test"

import { waitForHydration } from "./support/shell"

const FIXTURE = {
  connected: true,
  fetchedAt: "2026-10-17T00:45:00Z",
  stale: false,
  items: [{ number: 48, title: "Suspect-zero guard", url: "https://github.com/rbates7/hotdash/pull/48", owner: "simmons-bot", branch: "feat/suspect-zero", state: "ready_for_review", ci: "passing", review: "pending", proofLinks: ["https://github.com/user-attachments/assets/example.png"], updatedAt: "2026-10-16T22:10:00Z", mergedAt: null }],
}

test("work board is Not connected without the route, no sample cards", async ({ page }) => {
  await page.goto("/agent-workplace?tab=workboard")
  await waitForHydration(page)
  await expect(page.getByTestId("workboard-not-connected")).toBeVisible()
  await expect(page.getByTestId("work-card")).toHaveCount(0)
})

test("work board renders a mocked connected payload with 44px links on tablet", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.route("**/api/workboard", (r) => r.fulfill({ json: FIXTURE }))
  await page.goto("/agent-workplace?tab=workboard")
  await waitForHydration(page)
  const card = page.getByTestId("work-card")
  await expect(card).toHaveCount(1)
  await expect(page.getByRole("region", { name: "Ready for review" }).getByTestId("work-card")).toBeVisible()
  const box = await card.getByRole("link", { name: /PR #48/ }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

test("engineering playbook link opens Notion in a new tab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/agent-workplace")
  await waitForHydration(page)
  const link = page.getByRole("link", { name: "Engineering playbook" })
  await expect(link).toHaveAttribute("href", "https://app.notion.com/p/3fc91ff1f7b081b9a8dad75102fe4a99")
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", "noopener noreferrer")
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})
