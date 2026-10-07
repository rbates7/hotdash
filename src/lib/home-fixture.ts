import type { IsoDay } from "@/lib/clock"
import type { Kpi, NumberOne } from "@/lib/home"
import { growthStrip, truthStrip } from "@/lib/kpis"

/**
 * Dummy content for the Home pulse. The numbers themselves live in
 * `@/lib/kpis` — one fixture shared with the Metrics page, relative to the
 * real clock — so Home can never disagree with Metrics. The Needs-you rows
 * and the Dev board preview are not here either: they read the Agent
 * Workplace store.
 */

export const numberOne: NumberOne = {
  title: "Call Aledo before Friday",
  note: "Dummy · Friday walk-through",
}

/* ------------------------------------------------------------ KPI strip */

export type KpiSetId = "truth" | "growth"

/**
 * The two card sets that have been asked for so far. Which one Home shows
 * is a single switch below, so it can be flipped without touching any
 * component or test.
 *
 * - `truth`  — the truth strip per screens.md (Coulson): the two numbers
 *              that say whether the business is alive this week.
 * - `growth` — the original home-v0 mock: MRR / ARR / Subscribers / Churn.
 */
export function kpiSets(today: IsoDay): Record<KpiSetId, Kpi[]> {
  return {
    truth: truthStrip({ today }),
    growth: growthStrip({ today }),
  }
}

export const KPI_SET_TITLES: Record<KpiSetId, string> = {
  truth: "Truth strip",
  growth: "KPIs",
}

/** Flip this to `"growth"` to show MRR / ARR / Subscribers / Churn again. */
export const ACTIVE_KPI_SET: KpiSetId = "truth"

export function kpis(today: IsoDay): Kpi[] {
  return kpiSets(today)[ACTIVE_KPI_SET]
}

export const kpiStripTitle = KPI_SET_TITLES[ACTIVE_KPI_SET]
