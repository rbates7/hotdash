"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExpensesPanel } from "@/components/metrics/expenses-panel"
import { OverviewPanel } from "@/components/metrics/overview-panel"
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

export function MetricsTabs() {
  const router = useRouter()
  const params = useSearchParams()

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

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as MetricsTab)}
      className="min-w-0 gap-[18px]"
    >
      <TabsList
        variant="line"
        className="border-border w-full justify-start overflow-x-auto rounded-none border-b pb-[5px]"
      >
        {METRICS_TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="text-label flex-none px-3.5 py-1.5 font-medium tracking-tight"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview">
        <OverviewPanel />
      </TabsContent>
      <TabsContent value="new">
        <NewSubscribersTable />
      </TabsContent>
      <TabsContent value="churned">
        <ChurnedSubscribersTable />
      </TabsContent>
      <TabsContent value="expenses">
        <ExpensesPanel />
      </TabsContent>
    </Tabs>
  )
}
