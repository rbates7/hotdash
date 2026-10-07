import type { Kpi, NumberOne } from "@/lib/home"

/**
 * Dummy figures for the Home pulse, copied from founder-dashboard-home-v0.html.
 * The Home requirements are still open, so this is flat display data — no
 * model, no store — until the product is locked. The Needs-you rows and the
 * Dev board preview are not here: they read the Agent Workplace store so Home
 * and the Workplace can never disagree.
 */

export const numberOne: NumberOne = {
  title: "Call Aledo before Friday",
  note: "Dummy · Friday walk-through",
}

export const kpis: Kpi[] = [
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
]

/** Twelve weekly MRR readings ending on the headline figure above. */
export const mrrTrend = [
  21_840, 22_310, 22_780, 23_120, 23_590, 23_910, 24_360, 24_720, 25_080,
  25_430, 25_810, 26_190,
]
