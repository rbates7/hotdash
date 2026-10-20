import type { Kpi } from "@/lib/home"
import { METRIC_DEFS } from "@/lib/kpis"

/**
 * Which cards Home's KPI strip shows, with no figures (Rashad's Oct 16
 * rule). `liveKpis` (`@/lib/live-metrics`) fills each from its live source
 * or marks it Not connected; nothing here is ever shown as a number.
 */

export type KpiSetId = "truth" | "growth"

/** A card before its source answers: the label only. */
function card(id: string, label: string, lowerIsBetter?: boolean): Kpi {
  return { id, label, value: "–", delta: "", direction: "flat", source: "not_connected", ...(lowerIsBetter && { lowerIsBetter }) }
}

const metric = (id: "mrr" | "arr" | "subscribers" | "churn") =>
  card(id, METRIC_DEFS[id].label, METRIC_DEFS[id].lowerIsBetter)

/**
 * - `truth`  — the truth strip per screens.md (Coulson): the two numbers
 *              that say whether the business is alive this week.
 * - `growth` — the original home-v0 mock: MRR / ARR / Subscribers / Churn.
 */
export function kpiSets(): Record<KpiSetId, Kpi[]> {
  return {
    truth: [metric("subscribers"), card("cash-this-week", "Cash this week")],
    growth: [metric("mrr"), metric("arr"), metric("subscribers"), metric("churn")],
  }
}

export const KPI_SET_TITLES: Record<KpiSetId, string> = {
  truth: "Truth strip",
  growth: "KPIs",
}

/** Flip this to `"growth"` to show MRR / ARR / Subscribers / Churn again. */
export const ACTIVE_KPI_SET: KpiSetId = "truth"

export function kpis(): Kpi[] {
  return kpiSets()[ACTIVE_KPI_SET]
}

export const kpiStripTitle = KPI_SET_TITLES[ACTIVE_KPI_SET]
