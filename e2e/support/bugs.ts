import { expect, type Page } from "@playwright/test"

import { founderBoard } from "../../src/test/workplace"
import { NOTE, persistenceNote } from "./persistence"

/** Bugs has no key of its own: it reads and writes the Workplace's (`STORAGE_KEY` in `issues-store`). */
export const WORKPLACE_KEY = "hotdash.agent-workplace.v2"
export const WORKPLACE_REJECTED_KEY = `${WORKPLACE_KEY}.rejected`

/** Mirrored from `EMPTY_BUGS` / `EMPTY_BUGS_HINT` (`bugs-list.tsx`). */
export const EMPTY_BUGS = "No open bugs"
export const EMPTY_BUGS_HINT = "Tag a ticket bug on the Agent Workplace board and it shows here."

/** Mirrored from `SENTRY_CRASHES_TITLE` / `SENTRY_HINT` / `SENTRY_EMPTY` (`sentry-crashes.tsx`). */
export const SENTRY_TITLE = "Crashes and errors from Sentry"
export const SENTRY_HINT = "Unresolved crash and error issues in chlk-ios appear here once Sentry is connected."
export const SENTRY_EMPTY = "No unresolved crashes or errors in Sentry right now."

/**
 * The founder's own board (the old demo's content under CHLK-9xx keys and
 * sprint-1x ids), in the shape `issuesStorage` writes: `{ issues, sprints,
 * nextKey }`, no envelope and no clock. Its bug tickets (CHLK-904, -919,
 * -920, -921) are what Bugs lists. Dated back from `nowMs`.
 */
export function savedBoardWithUserBugs(nowMs = Date.now()) {
  return founderBoard(new Date(nowMs))
}

/** `path` with nothing saved: an empty board, so Bugs lists nothing. */
export async function freshBugs(page: Page, path = "/bugs") {
  await page.goto(path)
  await page.evaluate(
    ([a, b]) => {
      localStorage.removeItem(a)
      localStorage.removeItem(b)
    },
    [WORKPLACE_KEY, WORKPLACE_REJECTED_KEY]
  )
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

/**
 * `path` with the founder's own bug tickets saved in this browser. The same
 * goto / write / reload as `seededBoard` (support/roadmap.ts): the reload is
 * a new document, so a write counter installed with `countWrites` starts at
 * zero after it, and an edit is never overwritten by a later navigation.
 */
export async function seededBugs(page: Page, path = "/bugs") {
  await page.goto(path)
  await page.evaluate(
    ([key, rejected, value]) => {
      localStorage.removeItem(rejected)
      localStorage.setItem(key, value)
    },
    [WORKPLACE_KEY, WORKPLACE_REJECTED_KEY, JSON.stringify(savedBoardWithUserBugs())]
  )
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
}
