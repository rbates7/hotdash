import { addDays, type IsoDay } from "@/lib/clock"
import {
  daysAgoThisYear,
  type Initiative,
  type InitiativeStatus,
  type InitiativeType,
} from "@/lib/community-development"

/**
 * The old Community Development sample, for tests only: the app ships no
 * sample rows (Rashad's Oct 16 rule), and the store drops these ids from an
 * old saved copy (`SEED_INITIATIVE_IDS`). Tests that need rows use
 * `founderInitiatives`, the same rows under ids of the founder's own.
 */

/**
 * Eight rows around `today`: two Active, three upcoming in the next 30
 * days, one Done this year, two Ideas (one cadence-only foundation
 * scholarship, one outreach talk). Offsets stay relative so the same
 * split holds on any day.
 */
export function seedInitiatives(today: IsoDay): Initiative[] {
  const dated = (offset: number) => addDays(today, offset)
  const row = (
    n: number,
    name: string,
    type: InitiativeType,
    partner: string,
    date: IsoDay | null,
    cadence: string,
    status: InitiativeStatus,
    owner: string,
    impact: string
  ): Initiative => ({
    id: `initiative-${n}`,
    name,
    type,
    partner,
    date,
    cadence,
    status,
    owner,
    impact,
  })
  return [
    row(
      1,
      "Youth flag-football clinic volunteer day",
      "volunteer",
      "Houston Youth Flag League",
      dated(12),
      "",
      "planned",
      "Trip",
      "40 kids coached"
    ),
    row(
      2,
      "Refurbished iPads for a Title I program",
      "donation",
      "Katy ISD Title I",
      daysAgoThisYear(today, 40),
      "",
      "done",
      "Rashad",
      "12 iPads"
    ),
    row(
      3,
      "Chlk Foundation coaching scholarship",
      "foundation",
      "Chlk Foundation",
      null,
      "Annual, each spring",
      "idea",
      "Rashad",
      ""
    ),
    row(
      4,
      "Equipment drive for Yates High School",
      "donation",
      "Yates High School football",
      dated(8),
      "",
      "active",
      "Skye",
      "helmets, pads, and a playbook print run"
    ),
    row(
      5,
      "Coaches serve-day at the Houston Food Bank",
      "volunteer",
      "Houston Food Bank",
      dated(21),
      "",
      "planned",
      "Trip",
      ""
    ),
    row(
      6,
      "Free play-calling clinic for middle-school coaches",
      "outreach",
      "Cy-Fair ISD athletics",
      dated(45),
      "",
      "planned",
      "Skye",
      ""
    ),
    row(
      7,
      "Booster-club talk on giving back",
      "outreach",
      "Westlake HS booster club",
      null,
      "Once we have a date",
      "idea",
      "Rashad",
      ""
    ),
    row(
      8,
      "Saturday volunteer coaching at Alief rec",
      "volunteer",
      "Alief rec league",
      null,
      "Weekly, Saturday mornings",
      "active",
      "Trip",
      "18 kids on Saturdays"
    ),
  ]
}


/** The sample's rows under the founder's own ids (initiative-1 → initiative-101): survive the drop. */
export function founderInitiatives(today: IsoDay): Initiative[] {
  return seedInitiatives(today).map((r) => ({
    ...r,
    id: r.id.replace(/^initiative-(\d+)$/, (_, n) => `initiative-${100 + Number(n)}`),
  }))
}

/** A saved Community Development copy holding `founderInitiatives(today)`. */
export function founderInitiativesState(today: IsoDay) {
  return { initiatives: founderInitiatives(today), nextId: 109 }
}
