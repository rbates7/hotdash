import type { State } from "@/components/agent-workplace/issues-store"
import type { Issue, Sprint } from "@/lib/issues"
import { buildIssues, buildSprints } from "@/lib/issues-fixture"

/**
 * A board the founder built, for tests. The app ships no seed tickets, and
 * the store drops the old demo's keys (CHLK-401…421) and sprint ids
 * (sprint-4, sprint-5) from any saved copy, so tests that need tickets use
 * the demo's content under keys and ids of the founder's own:
 * CHLK-404 → CHLK-904, sprint-4 → sprint-14. Titles and fields unchanged.
 */
export const founderKey = (seedKey: string) => seedKey.replace(/^CHLK-4/, "CHLK-9")
export const founderSprintId = (seedId: string) => seedId.replace(/^sprint-(\d)$/, "sprint-1$1")

export function founderIssues(now: Date): Issue[] {
  return buildIssues(now).map((i) => ({
    ...i,
    key: founderKey(i.key),
    sprintId: i.sprintId === null ? null : founderSprintId(i.sprintId),
    activity: i.activity.map((a) => ({ ...a, id: a.id.replace(i.key, founderKey(i.key)) })),
  }))
}

export function founderSprints(now: Date): Sprint[] {
  return buildSprints(now).map((s) => ({ ...s, id: founderSprintId(s.id) }))
}

/** The whole demo board as the founder's own: what a populated saved copy holds. */
export function founderBoard(now: Date): State {
  const issues = founderIssues(now)
  const highest = Math.max(...issues.map((i) => Number(i.key.split("-")[1])))
  return { issues, sprints: founderSprints(now), nextKey: highest + 1 }
}

/** Save `board` (default: the founder's whole board) as this browser's Workplace copy. */
export function storeFounderBoard(now: Date, board: State = founderBoard(now)) {
  window.localStorage.setItem("hotdash.agent-workplace.v2", JSON.stringify(board))
  return board
}
