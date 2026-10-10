"use client"

import { CalendarIcon } from "lucide-react"

import { formatPeriod, periodEnding } from "@/lib/clock"
import { cn } from "@/lib/utils"
import { useMetrics } from "@/components/metrics/metrics-store"
import { METRICS_TOUCH } from "@/components/metrics/responsive"

/**
 * The header's date range. Reads the store's clock, not the request's, so
 * after a Reset (which re-dates the seed from the moment of the click) the
 * period shown and the period the cards report on are the same window.
 * Decorative for this pass (reqs: Open) — not a picker.
 */
export function MetricsHeaderPeriod() {
  const { today } = useMetrics()
  return (
    <span
      aria-disabled="true"
      data-testid="date-range"
      title="Trailing four weeks. Date range picker is not wired yet"
      className={cn(
        "bg-surface border-surface-border text-label inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-medium select-none",
        METRICS_TOUCH
      )}
    >
      <CalendarIcon className="text-muted-foreground size-[15px]" aria-hidden />
      {formatPeriod(periodEnding(today))}
    </span>
  )
}
