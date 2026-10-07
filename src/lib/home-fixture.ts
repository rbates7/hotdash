import type { Kpi, NumberOne } from "@/lib/home"

/**
 * Dummy figures for the Home pulse. The Home requirements are still open,
 * so this is flat display data — no model, no store — until the product is
 * locked. The Needs-you rows and the Dev board preview are not here: they
 * read the Agent Workplace store so Home and the Workplace can never
 * disagree.
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
export const KPI_SETS: Record<KpiSetId, Kpi[]> = {
  truth: [
    {
      id: "paying-coaches",
      label: "Paying coaches",
      value: "186",
      delta: "+12 this week",
      direction: "up",
    },
    {
      id: "cash-this-week",
      label: "Cash this week",
      value: "$4,860",
      delta: "+9.1% vs last week",
      direction: "up",
    },
  ],
  growth: [
    { id: "mrr", label: "MRR", value: "$26,190", delta: "+4.2%", direction: "up" },
    { id: "arr", label: "ARR", value: "$314,280", delta: "+4.2%", direction: "up" },
    { id: "subscribers", label: "Subscribers", value: "186", delta: "+12", direction: "up" },
    {
      id: "churn",
      label: "Churn Rate",
      value: "3.8%",
      delta: "−0.4 pts",
      direction: "down",
      lowerIsBetter: true,
    },
  ],
}

export const KPI_SET_TITLES: Record<KpiSetId, string> = {
  truth: "Truth strip",
  growth: "KPIs",
}

/** Flip this to `"growth"` to show MRR / ARR / Subscribers / Churn again. */
export const ACTIVE_KPI_SET: KpiSetId = "truth"

export const kpis: Kpi[] = KPI_SETS[ACTIVE_KPI_SET]
export const kpiStripTitle = KPI_SET_TITLES[ACTIVE_KPI_SET]

/** Twelve weekly MRR readings for the Metrics door's trend. */
export const mrrTrend = [
  21_840, 22_310, 22_780, 23_120, 23_590, 23_910, 24_360, 24_720, 25_080,
  25_430, 25_810, 26_190,
]
