import { addDays, todayIn } from "@/lib/clock"
import type { Deal } from "@/lib/sales-opportunities"

/**
 * The old Sales Opportunities sample, for tests only: the app ships no
 * sample deals (Rashad's Oct 16 rule), and the store drops these ids from
 * an old saved copy (`SEED_DEAL_IDS`). Tests that need rows use
 * `founderDeals`, the same rows under ids of the founder's own.
 */

type SeedRow = Omit<Deal, "id" | "nextStepDue" | "lastTouch" | "createdAt" | "updatedAt"> & {
  /** Days from today the next step is due; null for no date. Negative = overdue. */
  dueIn: number | null
  /** Days ago the last conversation happened. */
  touchedDaysAgo: number
}

// Invented names and schools. Football-coaching flavoured on purpose: a D2
// staff, an FCS staff, high-school programs, a clinic host that might buy.
const SEED_ROWS: readonly SeedRow[] = [
  {
    who: "Coach Darnell Whitaker",
    org: "Pine Bluff State (D2)",
    what: "Staff seats × 8",
    value: 3_840,
    stage: "proposal",
    nextStep: "Send the staff-seat quote to the AD",
    dueIn: 2,
    owner: "Trip",
    touchedDaysAgo: 1,
  },
  {
    who: "Coach Marcus Treadwell",
    org: "Red River A&M (FCS)",
    what: "Program license",
    value: 12_000,
    stage: "talking",
    nextStep: "Zoom walk-through with the OC",
    dueIn: 5,
    owner: "Rashad",
    touchedDaysAgo: 3,
  },
  {
    who: "Coach Lonnie Pruitt",
    org: "Cedar Creek HS (6A)",
    what: "Staff seats × 5",
    value: 1_500,
    stage: "verbal",
    nextStep: "Collect the PO from the booster club",
    dueIn: -2,
    owner: "Skye",
    touchedDaysAgo: 6,
  },
  {
    who: "Dana Alvarez",
    org: "Gulf Coast Coaches Clinic (host)",
    what: "Clinic package",
    value: 2_500,
    stage: "talking",
    nextStep: "Confirm the clinic date before pricing",
    dueIn: 9,
    owner: "Trip",
    touchedDaysAgo: 2,
  },
  {
    who: "Coach Reggie Okafor",
    org: "Blue Mesa Prep",
    what: "Annual plan × 3",
    value: 897,
    stage: "proposal",
    nextStep: "Follow up on the trial seats",
    dueIn: -1,
    owner: "Skye",
    touchedDaysAgo: 4,
  },
  {
    who: "Coach Tommy Hale",
    org: "Harlan County HS",
    what: "Staff seats × 4",
    value: null,
    stage: "talking",
    nextStep: "Hear back after their spring staff meeting",
    dueIn: null,
    owner: "Trip",
    touchedDaysAgo: 8,
  },
  {
    who: "Coach Vince Castellano",
    org: "Lakeshore Catholic",
    what: "Program license",
    value: 4_200,
    stage: "closed-won",
    nextStep: "Kickoff call with their staff",
    dueIn: 1,
    owner: "Rashad",
    touchedDaysAgo: 0,
  },
  {
    who: "Coach Aaron Fitch",
    org: "Ironwood College (D3)",
    what: "Staff seats × 6",
    value: 2_100,
    stage: "closed-lost",
    nextStep: "Revisit after their spring game",
    dueIn: null,
    owner: "Trip",
    touchedDaysAgo: 12,
  },
]

/**
 * The sample deals, dated against `nowMs`. Due dates are Central calendar
 * days offset from today. Last touches land at midday Central on the
 * calendar day N days back (not `now − N×24h`, which drifts a day across a
 * DST change), so a seed built at 23:30 CT still says "3 days ago" on both
 * sides of UTC midnight.
 */
export function seedDeals(nowMs: number): Deal[] {
  const instant = new Date(nowMs)
  const today = todayIn(instant)
  const at = instant.toISOString()
  return SEED_ROWS.map((row, i) => {
    const { dueIn, touchedDaysAgo, ...rest } = row
    // 17:00Z is 11am CST / noon CDT: inside the Central day either way.
    const touched =
      touchedDaysAgo === 0 ? at : `${addDays(today, -touchedDaysAgo)}T17:00:00.000Z`
    return {
      id: `deal-${i + 1}`,
      ...rest,
      nextStepDue: dueIn === null ? null : addDays(today, dueIn),
      lastTouch: touched,
      createdAt: touched,
      updatedAt: at,
    }
  })
}

/** The sample's deals under the founder's own ids (deal-1 → deal-101): survive the drop. */
export function founderDeals(nowMs: number): Deal[] {
  return seedDeals(nowMs).map((d) => ({ ...d, id: d.id.replace(/^deal-(\d+)$/, (_, n) => `deal-${100 + Number(n)}`) }))
}

/** A saved Sales copy holding `founderDeals(nowMs)`. */
export function founderDealsState(nowMs: number) {
  return { deals: founderDeals(nowMs), nextId: 109 }
}
