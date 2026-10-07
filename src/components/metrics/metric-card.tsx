"use client"

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartColumnIcon,
  ChartLineIcon,
  XIcon,
} from "lucide-react"

import {
  formatMetricValue,
  trendFor,
  type ChartType,
  type MetricSnapshot,
} from "@/lib/metrics"
import { cn } from "@/lib/utils"
import { MetricChart } from "@/components/metrics/metric-chart"

function ToolButton({
  on,
  className,
  ...props
}: React.ComponentProps<"button"> & { on?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "border-surface-border text-muted-foreground grid size-6 place-items-center rounded-md border transition-colors",
        "hover:bg-surface-hover hover:text-foreground",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        "[&_svg]:size-[13px]",
        on && "bg-foreground text-background border-foreground hover:bg-foreground hover:text-background",
        className
      )}
      {...props}
    />
  )
}

export function TrendPill({
  snapshot,
}: {
  snapshot: Pick<MetricSnapshot, "value" | "previous" | "trendKind" | "lowerIsBetter" | "unit">
}) {
  const trend = trendFor(snapshot.value, snapshot.previous, snapshot.trendKind, {
    lowerIsBetter: snapshot.lowerIsBetter,
    unit: snapshot.unit,
  })
  const Arrow = trend.up ? ArrowUpIcon : ArrowDownIcon
  return (
    <span
      data-testid="trend"
      data-good={trend.flat ? undefined : trend.good}
      className={cn(
        "text-caption inline-flex items-center gap-[3px] rounded-full py-[3px] pr-2 pl-1.5 leading-[1.2] font-semibold tracking-tight",
        trend.flat
          ? "bg-muted text-muted-foreground"
          : trend.good
            ? "bg-success/10 text-success"
            : "bg-destructive/10 text-destructive"
      )}
    >
      {!trend.flat && <Arrow className="size-[11px]" strokeWidth={2.25} aria-hidden />}
      {trend.text}
    </span>
  )
}

export function MetricCard({
  snapshot,
  chart,
  onChartChange,
  onRemove,
  className,
}: {
  snapshot: MetricSnapshot
  chart: ChartType
  onChartChange: (chart: ChartType) => void
  /** Omit to hide the × (the Expenses tab's card is not removable). */
  onRemove?: () => void
  className?: string
}) {
  return (
    <article
      aria-label={snapshot.label}
      data-metric={snapshot.id}
      className={cn(
        "group/metric bg-surface border-surface-border flex min-h-[176px] flex-col rounded-xl border px-5 pt-5 pb-[18px]",
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-label font-semibold tracking-tight">{snapshot.label}</h2>
        <div
          className="flex flex-none items-center gap-1"
          role="group"
          aria-label={`${snapshot.label} chart type`}
        >
          <ToolButton
            on={chart === "bar"}
            aria-pressed={chart === "bar"}
            aria-label={`${snapshot.label}: bar chart`}
            onClick={() => onChartChange("bar")}
          >
            <ChartColumnIcon aria-hidden />
          </ToolButton>
          <ToolButton
            on={chart === "line"}
            aria-pressed={chart === "line"}
            aria-label={`${snapshot.label}: line chart`}
            onClick={() => onChartChange("line")}
          >
            <ChartLineIcon aria-hidden />
          </ToolButton>
          {onRemove && (
            <ToolButton
              aria-label={`Remove ${snapshot.label}`}
              onClick={onRemove}
              className="border-transparent opacity-40 group-hover/metric:opacity-85 hover:opacity-100 focus-visible:opacity-100"
            >
              <XIcon aria-hidden />
            </ToolButton>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            data-testid="metric-value"
            className="text-[28px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums"
          >
            {formatMetricValue(snapshot.value, snapshot.unit)}
          </p>
          {snapshot.note && (
            <p className="text-micro text-muted-foreground mt-1.5 font-medium tracking-tight">
              {snapshot.note}
            </p>
          )}
          <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
            <TrendPill snapshot={snapshot} />
            <span className="text-caption text-muted-foreground tracking-tight whitespace-nowrap">
              compared to last month
            </span>
          </div>
        </div>
        <MetricChart series={snapshot.series} type={chart} label={snapshot.label} />
      </div>
    </article>
  )
}
