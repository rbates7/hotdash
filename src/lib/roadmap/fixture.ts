import { monthLabel, quarterLabel, signedDaysAgo, yearLabel } from "@/lib/roadmap/dates"
import type { RoadmapColumn, RoadmapItem, RoadmapOwner, RoadmapState } from "@/lib/roadmap/roadmap"

type SeedRow = {
  title: string
  why: string
  owner: RoadmapOwner
  /** Built from `nowMs` so the window always reads as upcoming. */
  window: (nowMs: number) => string
  column: RoadmapColumn
  linkedTickets: number
  fromFeatureRequest?: true
  /** Central calendar days before "now" that the bet was signed. */
  signedDaysAgo: number
}

/**
 * Eight believable Chlk bets, in board order. Windows and signed dates are
 * offsets from the request clock so the board always reads as current.
 * Nothing here is a real signed bet; every card carries the sample tag.
 */
export const SEED_ROWS: readonly SeedRow[] = [
  // Now
  {
    title: "Flag Football 2026",
    why: "The 2026 flag season is the biggest wave of new coaches we will see. Being ready for it is the year.",
    owner: "Rashad",
    window: (now) => quarterLabel(now, 0),
    column: "now",
    linkedTickets: 4,
    signedDaysAgo: 34,
  },
  {
    title: "Play share links",
    why: "A coach who can send one play brings the rest of the staff in with it.",
    owner: "Mace",
    window: (now) => monthLabel(now, 1),
    column: "now",
    linkedTickets: 3,
    fromFeatureRequest: true,
    signedDaysAgo: 21,
  },
  {
    title: "iPad forced updates",
    why: "Half of support is coaches on a stale build. Set a floor and the bug list halves.",
    owner: "Rashad",
    window: (now) => monthLabel(now, 0),
    column: "now",
    linkedTickets: 2,
    signedDaysAgo: 12,
  },
  // Next
  {
    title: "Web import from a link",
    why: "HUDL and film URLs are where plays already live. Meet coaches there.",
    owner: "Mace",
    window: (now) => quarterLabel(now, 1),
    column: "next",
    linkedTickets: 1,
    fromFeatureRequest: true,
    signedDaysAgo: 9,
  },
  {
    title: "Staff seats",
    why: "Staff orgs are the only plan that grows without a new coach each time.",
    owner: "Rashad",
    window: (now) => quarterLabel(now, 1),
    column: "next",
    linkedTickets: 0,
    signedDaysAgo: 6,
  },
  {
    title: "CSV web import",
    why: "A spreadsheet of plays into the library in one drop unblocks every switcher.",
    owner: "Mace",
    window: (now) => quarterLabel(now, 1),
    column: "next",
    linkedTickets: 0,
    fromFeatureRequest: true,
    signedDaysAgo: 3,
  },
  // Later
  {
    title: "Auto-scout from film",
    why: "Tagging formations from film is the moat. Too big until the imports land.",
    owner: "Mace",
    window: (now) => quarterLabel(now, 2),
    column: "later",
    linkedTickets: 0,
    fromFeatureRequest: true,
    signedDaysAgo: 2,
  },
  {
    title: "Parent recap emails",
    why: "Parents are the second audience. A weekly recap makes Chlk visible at home.",
    owner: "Rashad",
    window: (now) => yearLabel(now, 1),
    column: "later",
    linkedTickets: 0,
    fromFeatureRequest: true,
    signedDaysAgo: 0,
  },
]

/** Builds the seed against `nowMs`, so every window and date is measured from today. */
export function buildSeed(nowMs: number): RoadmapItem[] {
  const perColumn: Record<RoadmapColumn, number> = { now: 0, next: 0, later: 0 }
  return SEED_ROWS.map((row, i) => {
    const at = signedDaysAgo(nowMs, row.signedDaysAgo)
    const item: RoadmapItem = {
      id: `rm-${i + 1}`,
      title: row.title,
      why: row.why,
      owner: row.owner,
      window: row.window(nowMs),
      column: row.column,
      order: perColumn[row.column]++,
      linkedTickets: row.linkedTickets,
      sample: true,
      signedAt: at,
      updatedAt: at,
    }
    if (row.fromFeatureRequest) item.fromFeatureRequest = true
    return item
  })
}

export function seedState(nowMs: number): RoadmapState {
  const items = buildSeed(nowMs)
  return { items, nextId: items.length + 1 }
}
