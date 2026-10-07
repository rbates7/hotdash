"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { formatMetricValue, pickerIds, type MetricId } from "@/lib/metrics"
import { METRIC_DEFS, snapshotFor } from "@/lib/kpis"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MetricCard } from "@/components/metrics/metric-card"
import { useMetrics } from "@/components/metrics/metrics-store"
import { SampleDataTag } from "@/components/sample-data"

/** "+ Add metric" and its picker: extras first, then any removed default. */
function AddMetric() {
  const { today, visible, expenses, addMetric } = useMetrics()
  const [open, setOpen] = React.useState(false)
  const choices = pickerIds(visible)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" className="h-9 px-3.5">
            <PlusIcon aria-hidden />
            Add metric
          </Button>
        }
      />
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[260px] gap-0 p-1.5"
        aria-label="Add a metric"
      >
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1.5">
          <p className="text-micro text-muted-foreground font-semibold tracking-[0.06em] uppercase">
            Add a metric
          </p>
          <SampleDataTag />
        </div>
        {choices.length === 0 ? (
          <p className="text-caption text-muted-foreground px-2.5 py-2.5">
            All metrics are on the board
          </p>
        ) : (
          <ul className="flex flex-col">
            {choices.map((id) => {
              const snap = snapshotFor(id, { today, expenses })
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      addMetric(id)
                      setOpen(false)
                    }}
                    className="text-label hover:bg-surface-hover flex h-9 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left font-medium"
                  >
                    <span>{snap.label}</span>
                    <span className="text-caption text-muted-foreground tabular-nums">
                      {formatMetricValue(snap.value, snap.unit)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function OverviewPanel() {
  const { today, visible, charts, expenses, setChart, removeMetric } = useMetrics()

  return (
    <div className="flex flex-col items-start gap-[18px]">
      {visible.length === 0 ? (
        <div
          role="status"
          aria-label="Empty board"
          className="border-surface-border text-muted-foreground flex min-h-[176px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 text-center"
        >
          <p className="text-body text-foreground font-medium">No metrics on the board</p>
          <p className="text-caption">
            Every card has been removed. Use “Add metric” to bring one back.
          </p>
        </div>
      ) : (
        <section
          aria-label="Metric cards"
          className="grid w-full grid-cols-1 gap-[18px] md:grid-cols-2 min-[1680px]:grid-cols-4"
        >
          {visible.map((id: MetricId) => {
            const snapshot = snapshotFor(id, { today, expenses })
            return (
              <MetricCard
                key={id}
                snapshot={snapshot}
                chart={charts[id] ?? METRIC_DEFS[id].defaultChart}
                onChartChange={(chart) => setChart(id, chart)}
                onRemove={() => removeMetric(id)}
              />
            )
          })}
        </section>
      )}
      <AddMetric />
    </div>
  )
}
