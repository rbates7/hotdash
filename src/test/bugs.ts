import type { Issue } from "@/lib/issues"
import { BUG_LABEL } from "@/lib/bugs"
import { buildIssues } from "@/lib/issues-fixture"

/**
 * The founder's own bug tickets for tests: the Workplace seed's four bug
 * tickets copied under keys the seed never uses (CHLK-404 → CHLK-904,
 * CHLK-419 → CHLK-919, …), titles and fields unchanged. Bugs lists only
 * tickets like these; the seed bugs stay on the Workplace board alone.
 */
export const userKey = (seedKey: string) => seedKey.replace(/^CHLK-4/, "CHLK-9")

export function userBugIssues(now: Date): Issue[] {
  return buildIssues(now)
    .filter((i) => i.labels.includes(BUG_LABEL))
    .map((i) => ({ ...i, key: userKey(i.key) }))
}

/** The seed board plus the founder's own bug copies: what a saved Workplace copy holds. */
export function boardWithUserBugs(now: Date): Issue[] {
  return [...buildIssues(now), ...userBugIssues(now)]
}
