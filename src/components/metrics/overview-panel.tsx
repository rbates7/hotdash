"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { formatMetricValue, pickerIds, type MetricId } from "@/lib/metrics"
import { METRIC_DEFS, snapshotFor } from "@/lib/kpis"
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { MetricCard } from "@/components/metrics/metric-card"
import { useMetrics } from "@/components/metrics/metrics-store"
import {
  METRICS_GRID,
  METRICS_PICKER_ITEM,
  METRICS_SHEET,
  METRICS_SHEET_HANDLE,
  METRICS_SHEET_HEADER,
  METRICS_TOUCH,
} from "@/components/metrics/responsive"
import { useMetricsSheetTabTrap } from "@/components/metrics/sheet-tab-trap"
import { SampleDataTag } from "@/components/sample-data"

function PickerChoices({
  onPick,
  chrome = true,
}: {
  onPick: (id: MetricId) => void
  chrome?: boolean
}) {
  const { today, visible, expenses } = useMetrics()
  const choices = pickerIds(visible)

  return (
    <>
      {chrome ? (
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1.5">
          <p className="text-micro text-muted-foreground font-semibold tracking-[0.06em] uppercase">
            Add a metric
          </p>
          <SampleDataTag />
        </div>
      ) : (
        <div className="flex justify-end px-2.5 pb-1.5">
          <SampleDataTag />
        </div>
      )}
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
                  onClick={() => onPick(id)}
                  className={METRICS_PICKER_ITEM}
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
    </>
  )
}

/** "+ Add metric" and its picker: extras first, then any removed default. */
function AddMetric() {
  const { addMetric } = useMetrics()
  const phone = useIsMobile()
  const tablet = useIsTablet()
  const compact = phone || tablet
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  useMetricsSheetTabTrap(compact && open)

  function pick(id: MetricId) {
    addMetric(id)
    setOpen(false)
  }

  const trigger = (
    <Button
      ref={triggerRef}
      size="sm"
      className={`h-9 px-3.5 ${METRICS_TOUCH}`}
      onClick={compact ? () => setOpen(true) : undefined}
    >
      <PlusIcon aria-hidden />
      Add metric
    </Button>
  )

  if (compact) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className={METRICS_SHEET}
            finalFocus={triggerRef}
          >
            <div aria-hidden className={METRICS_SHEET_HANDLE} />
            <SheetHeader className={METRICS_SHEET_HEADER}>
              <SheetTitle>Add a metric</SheetTitle>
              <SheetDescription>
                Extra metrics and any card you have removed. Sample figures.
              </SheetDescription>
            </SheetHeader>
            <PickerChoices onPick={pick} chrome={false} />
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" className={`h-9 px-3.5 ${METRICS_TOUCH}`}>
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
        <PickerChoices onPick={pick} />
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
          className={METRICS_GRID}
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
