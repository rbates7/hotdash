import { expect, type Page } from "@playwright/test"

import { seedState } from "../../src/lib/roadmap/fixture"
import type { RoadmapState } from "../../src/lib/roadmap/roadmap"
import { NOTE, persistenceNote } from "./persistence"

/** Mirrored from `@/components/product-roadmap/roadmap-store`. */
export const ROADMAP_KEY = "hotdash.product-roadmap.v1"
export const ROADMAP_REJECTED_KEY = `${ROADMAP_KEY}.rejected`

/** Mirrored from `NOTION_NOT_CONNECTED_COPY` / `NOTION_CONNECTING_COPY` (`roadmap-board.tsx`). */
export const NOT_CONNECTED_COPY =
  "Notion is not connected, so the signed roadmap can\u2019t show here. Bets you add stay in this browser only."
export const CONNECTING_COPY = "Connecting to Notion\u2026"

/**
 * The app starts the Roadmap empty (no sample bets). The editing specs need
 * bets to move, so they save the fixture's eight bets as a founder's own
 * (no sample tag, which a saved copy never keeps) — tests only.
 */
export function ownBets(nowMs = Date.now()): RoadmapState {
  const state = seedState(nowMs)
  return {
    ...state,
    items: state.items.map((item) => {
      const own = { ...item }
      delete own.sample
      return own
    }),
  }
}

/** The board with nothing saved: empty, under Not connected. */
export async function freshBoard(page: Page) {
  await page.goto("/product-roadmap")
  await page.evaluate(
    ([a, b]) => {
      localStorage.removeItem(a)
      localStorage.removeItem(b)
    },
    [ROADMAP_KEY, ROADMAP_REJECTED_KEY]
  )
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

/** The board with the fixture's eight bets saved in this browser. */
export async function seededBoard(page: Page) {
  await page.goto("/product-roadmap")
  await page.evaluate(
    ([key, rejected, value]) => {
      localStorage.removeItem(rejected)
      localStorage.setItem(key, value)
    },
    [ROADMAP_KEY, ROADMAP_REJECTED_KEY, JSON.stringify(ownBets())]
  )
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
  await expect(page.getByRole("article", { name: "Flag Football 2026", exact: true })).toHaveCount(1)
}
