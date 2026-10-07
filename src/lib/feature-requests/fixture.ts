import { daysAgo } from "@/lib/feature-requests/clock"
import {
  DEFAULT_FROM,
  type FeatureRequest,
  type FeatureStatus,
} from "@/lib/feature-requests/feature-requests"

type SeedRow = {
  title: string
  ask: string
  status: FeatureStatus
  /** Days before "now". Spacing copied from the mock's dates (24 Aug = 0). */
  age: number
}

/**
 * The ten cards from `founder-dashboard-feature-v0.html`, in mock order.
 * Dates are offsets so the board always reads as recent; nothing here is a
 * real request from Dan.
 */
export const SEED_ROWS: readonly SeedRow[] = [
  { title: "Play of the Day", ask: "Pin one ready-to-run play at the top of the morning board.", status: "inbox", age: 0 },
  { title: "Web import from a link", ask: "Paste a HUDL or film URL and drop the play into Chlk.", status: "inbox", age: 2 },
  { title: "Staff share sheet", ask: "One-tap share of a play to the rest of the staff.", status: "inbox", age: 5 },
  { title: "Custom play headers", ask: "Let coaches name formation and personnel above the board.", status: "triaged", age: 10 },
  { title: "Share to locker-room TV", ask: "Cast the current play to the gym display without leaving Chlk.", status: "triaged", age: 13 },
  { title: "Voice note on a play", ask: "Record a 15-second coaching note on any card.", status: "triaged", age: 20 },
  { title: "Play share links", ask: "Public or staff-only URL for a single play.", status: "roadmap", age: 26 },
  { title: "CSV web import", ask: "Drop a spreadsheet of plays into the library.", status: "roadmap", age: 33 },
  { title: "Auto-scout from film", ask: "Tag formations automatically from uploaded film.", status: "parked", age: 37 },
  { title: "Parent recap emails", ask: "Weekly recap of what the team practiced.", status: "parked", age: 46 },
]

/** Builds the seed against `now`, so every age is measured from today. */
export function buildSeed(now: Date): FeatureRequest[] {
  return SEED_ROWS.map((row, i) => {
    const at = daysAgo(row.age, now).toISOString()
    return {
      id: `fr-${i + 1}`,
      title: row.title,
      ask: row.ask,
      from: DEFAULT_FROM,
      status: row.status,
      createdAt: at,
      updatedAt: at,
      sample: true,
    }
  })
}
