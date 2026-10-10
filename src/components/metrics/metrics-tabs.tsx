"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExpensesPanel } from "@/components/metrics/expenses-panel"
import { useMetrics } from "@/components/metrics/metrics-store"
import { OverviewPanel } from "@/components/metrics/overview-panel"
import {
  METRICS_GRID,
  METRICS_TAB,
  METRICS_TABLIST,
  METRICS_TABS_FADE,
  METRICS_TABS_WRAP,
} from "@/components/metrics/responsive"
import {
  ChurnedSubscribersTable,
  NewSubscribersTable,
} from "@/components/metrics/subscribers-tables"

/** The locked tab set, in the locked order. */
export const METRICS_TABS = [
  { value: "overview", label: "Overview" },
  { value: "new", label: "New Subscribers" },
  { value: "churned", label: "Churned Subscribers" },
  { value: "expenses", label: "Expenses" },
] as const

export type MetricsTab = (typeof METRICS_TABS)[number]["value"]

const DEFAULT_TAB: MetricsTab = "overview"

function isTab(value: string | null): value is MetricsTab {
  return METRICS_TABS.some((t) => t.value === value)
}

/**
 * Stands in for a panel until localStorage has been read. Showing the seed
 * here would flash numbers the user may have changed; the Overview's shape
 * is a card grid, the rest are tables.
 */
function PanelSkeleton({ tab }: { tab: MetricsTab }) {
  if (tab === "overview") {
    return (
      <div
        role="status"
        aria-label="Loading saved metrics"
        className={METRICS_GRID}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[176px] rounded-xl" />
        ))}
      </div>
    )
  }
  return (
    <div role="status" aria-label="Loading saved metrics" className="flex flex-col gap-[18px]">
      {tab === "expenses" && <Skeleton className="h-[176px] w-full max-w-[420px] rounded-xl" />}
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}

export function MetricsTabs() {
  const router = useRouter()
  const params = useSearchParams()
  const { persisted } = useMetrics()

  const requested = params.get("tab")
  const tab: MetricsTab = isTab(requested) ? requested : DEFAULT_TAB

  // The tab lives in the URL so each view is linkable and the back button
  // steps through them, as on the Agent Workplace.
  const setTab = React.useCallback(
    (next: MetricsTab) => {
      const qs = new URLSearchParams(params.toString())
      if (next === DEFAULT_TAB) qs.delete("tab")
      else qs.set("tab", next)
      const s = qs.toString()
      router.push(s ? `?${s}` : "?", { scroll: false })
    },
    [params, router]
  )

  const panel = (value: MetricsTab, content: React.ReactNode) => (
    <TabsContent value={value}>
      {persisted ? content : <PanelSkeleton tab={value} />}
    </TabsContent>
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as MetricsTab)}
      className="min-w-0 gap-[18px]"
    >
      <div className={METRICS_TABS_WRAP}>
        <TabsList
          variant="line"
          aria-label="Metrics views"
          className={METRICS_TABLIST}
        >
          {METRICS_TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={METRICS_TAB}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div data-testid="metrics-tabs-fade" className={METRICS_TABS_FADE} />
      </div>

      {panel("overview", <OverviewPanel />)}
      {panel("new", <NewSubscribersTable />)}
      {panel("churned", <ChurnedSubscribersTable />)}
      {panel("expenses", <ExpensesPanel />)}
    </Tabs>
  )
}
