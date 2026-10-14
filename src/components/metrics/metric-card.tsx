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
import { VS_PREVIOUS_WINDOW } from "@/lib/kpis"
import { liveValueText, type LiveState } from "@/lib/live-metrics"
import { MetricChart } from "@/components/metrics/metric-chart"
import { useMetrics } from "@/components/metrics/metrics-store"
import { METRICS_ICON, METRICS_PRESSED } from "@/components/metrics/responsive"
import { SampleDataTag } from "@/components/sample-data"

function ToolButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "border-surface-border text-muted-foreground grid size-6 place-items-center rounded-md border transition-colors",
        "hover:bg-surface-hover hover:text-foreground",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        "[&_svg]:size-[13px]",
        METRICS_ICON,
        METRICS_PRESSED,
        "max-xl:focus-visible:ring-inset",
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
            ? "bg-success/10 text-success-text"
            : "bg-destructive/10 text-danger-text"
      )}
    >
      {!trend.flat && <Arrow className="size-[11px]" strokeWidth={2.25} aria-hidden />}
      {trend.text}
    </span>
  )
}

const SAMPLE: LiveState = { kind: "sample" }

export function MetricCard({
  snapshot,
  chart,
  onChartChange,
  onRemove,
  className,
  live = SAMPLE,
}: {
  snapshot: MetricSnapshot
  chart: ChartType
  onChartChange: (chart: ChartType) => void
  /** Omit to hide the × (the Expenses tab's card is not removable). */
  onRemove?: () => void
  className?: string
  /** Stripe's figures for this card, when Stripe feeds it (`liveMetric`). */
  live?: LiveState
}) {
  const { today } = useMetrics()
  const loading = live.kind === "loading"
  const stripe = live.kind === "live" ? live.metric : null
  // Live figures replace the sample ones wholesale; a null is shown as one.
  const shown = stripe ?? { value: snapshot.value, previous: snapshot.previous, series: snapshot.series }
  const trendable = !loading && shown.value !== null && shown.previous !== null
  const trend = trendable
    ? trendFor(shown.value!, shown.previous!, snapshot.trendKind, {
        lowerIsBetter: snapshot.lowerIsBetter,
        unit: snapshot.unit,
      })
    : null
  const valueText = loading ? "–" : stripe ? liveValueText(stripe, snapshot.unit) : formatMetricValue(snapshot.value, snapshot.unit)
  const charted = !loading && shown.series.some((v) => v !== null)
  // Key facts once: label, headline, delta. Inner copy is the same words,
  // so the article name is the aria-label rather than a concatenation.
  const name = loading
    ? `${snapshot.label} loading`
    : [snapshot.label, valueText, trend?.text ?? stripe?.empty].filter(Boolean).join(" ")
  return (
    <article
      aria-label={name}
      aria-busy={loading || undefined}
      data-metric={snapshot.id}
      data-source={live.kind === "live" ? "stripe" : live.kind}
      className={cn(
        "group/metric bg-surface border-surface-border flex min-h-[176px] flex-col rounded-xl border px-5 pt-5 pb-[18px]",
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-label font-semibold tracking-tight">{snapshot.label}</h2>
          {live.kind === "sample" && <SampleDataTag />}
        </div>
        <div
          className="flex flex-none items-center gap-1"
          role="group"
          aria-label={`${snapshot.label} chart type`}
        >
          <ToolButton
            aria-pressed={chart === "bar"}
            aria-label={`${snapshot.label}: bar chart`}
            onClick={() => onChartChange("bar")}
          >
            <ChartColumnIcon aria-hidden />
          </ToolButton>
          <ToolButton
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
            className={cn(
              "text-[28px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums",
              loading && "text-muted-foreground"
            )}
          >
            {valueText}
          </p>
          {snapshot.note && (
            <p className="text-micro text-muted-foreground mt-1.5 font-medium tracking-tight">
              {snapshot.note}
            </p>
          )}
          {stripe?.updated && (
            <p data-testid="metric-updated" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
              {stripe.updated}
            </p>
          )}
          {trend ? (
            <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
              <TrendPill
                snapshot={{ ...snapshot, value: shown.value!, previous: shown.previous! }}
              />
              <span className="text-caption text-muted-foreground tracking-tight whitespace-nowrap">
                {VS_PREVIOUS_WINDOW}
              </span>
            </div>
          ) : stripe ? (
            <p className="text-caption text-muted-foreground mt-2.5 tracking-tight">
              {stripe.empty ?? `No reading for the previous 28 days`}
            </p>
          ) : null}
        </div>
        {charted ? (
          <MetricChart
            series={shown.series}
            type={chart}
            label={snapshot.label}
            unit={snapshot.unit}
            today={today}
          />
        ) : (
          <div aria-hidden className="h-[52px] w-[120px] flex-none" />
        )}
      </div>
    </article>
  )
}
