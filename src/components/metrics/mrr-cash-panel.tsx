"use client"

import { formatDayShort } from "@/lib/clock"
import { lastUpdatedLabel } from "@/lib/live-metrics"
import { formatCurrency } from "@/lib/metrics"
import {
  monthLabel,
  panelStateOf,
  weekdayLabel,
  type CashDay,
  type MrrCashPanelState,
  type MrrPoint,
} from "@/lib/stripe-mrr-cash"
import { useSettings } from "@/hooks/use-settings"
import { useMrrCashView } from "@/hooks/use-stripe-mrr-cash"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/** The same words as the Metrics overview while Stripe's first sync runs. */
export const STRIPE_CONNECTING_PLACEHOLDER = "Stripe is connecting (first sync in progress)"

/**
 * The MRR chart (one bar per month, this month partial) and Cash this week
 * by day beside last week, from Stripe through `/api/stripe/mrr-cash`.
 * There is no sample state: before the first sync it is a placeholder that
 * says Stripe is connecting, and with no key it says Not connected.
 */
export function MrrCashPanel() {
  const { timeZone } = useSettings()
  return <MrrCashPanelView state={panelStateOf(useMrrCashView())} timeZone={timeZone} />
}

export function MrrCashPanelView({ state, timeZone }: { state: MrrCashPanelState; timeZone: string }) {
  return (
    <TooltipProvider delay={100}>
      <section
        aria-label="MRR and cash this week"
        aria-busy={state.kind === "loading"}
        data-testid="mrr-cash-panel"
        data-state={state.kind === "loading" && state.connecting ? "connecting" : state.kind}
        className="border-surface-border bg-card flex w-full flex-col gap-4 rounded-xl border p-4"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-body text-foreground font-medium">MRR and cash this week</h2>
          {state.kind === "live" && state.stale && (
            <p data-testid="mrr-cash-updated" className="text-caption text-muted-foreground">
              {lastUpdatedLabel(state.lastSyncedAt, timeZone)}
            </p>
          )}
        </header>
        {state.kind === "live" ? (
          <div className="grid gap-6 md:grid-cols-2">
            <MrrBars points={state.mrr.points} />
            <CashDays value={state.cash.value} previous={state.cash.previous} days={state.cash.days} />
          </div>
        ) : (
          <Placeholder state={state} />
        )}
      </section>
    </TooltipProvider>
  )
}

function Placeholder({ state }: { state: Exclude<MrrCashPanelState, { kind: "live" }> }) {
  const text =
    state.kind === "not_connected" ? "Stripe not connected" : state.connecting ? STRIPE_CONNECTING_PLACEHOLDER : null
  return (
    <div
      role="status"
      data-testid="mrr-cash-placeholder"
      className="text-caption text-muted-foreground flex min-h-[120px] items-center justify-center rounded-lg border border-dashed"
    >
      {text ?? <span className="sr-only">Loading</span>}
    </div>
  )
}

const BAR_H = 96

/**
 * The two cash series. Last week is `muted-foreground` at full strength:
 * at least 3:1 against `--card` in both themes (6.5:1 light, 7.2:1 dark),
 * where the old `/30` tint was about 1.5:1. The legend names both, so the
 * series are never told apart by colour alone.
 */
export const CASH_THIS_WEEK_BAR = "bg-primary"
export const CASH_LAST_WEEK_BAR = "bg-muted-foreground"

/** Matches the shared chart legend (components/ui/chart.tsx ChartLegendContent). */
function CashLegend() {
  return (
    <ul
      aria-label="Legend"
      data-testid="cash-legend"
      className="text-caption text-muted-foreground flex items-center justify-center gap-4"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden data-testid="cash-legend-this-week" className={`h-2 w-2 shrink-0 rounded-[2px] ${CASH_THIS_WEEK_BAR}`} />
        This week
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden data-testid="cash-legend-last-week" className={`h-2 w-2 shrink-0 rounded-[2px] ${CASH_LAST_WEEK_BAR}`} />
        Last week
      </li>
    </ul>
  )
}

function MrrBars({ points }: { points: MrrPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.value))
  const first = points[0]
  const last = points[points.length - 1]
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span data-testid="mrr-chart-caption" className="text-caption text-muted-foreground min-w-0">
          MRR · {points.length} months · USD, past months at today&apos;s prices
        </span>
        <span
          data-testid="mrr-chart-latest"
          className="text-body text-foreground shrink-0 font-medium whitespace-nowrap tabular-nums"
        >
          {formatCurrency(last.value)}
        </span>
      </figcaption>
      <ol
        aria-label={`MRR by month, ${monthLabel(first.month, true)} to ${monthLabel(last.month, true)}, ${formatCurrency(first.value)} to ${formatCurrency(last.value)}`}
        className="flex items-end gap-1"
        style={{ height: BAR_H }}
      >
        {points.map((p) => (
          <Tooltip key={p.month}>
            <TooltipTrigger
              render={
                <li
                  data-testid="mrr-bar"
                  data-month={p.month}
                  className={`flex-1 rounded-sm ${p.partial ? "bg-primary/50" : "bg-primary"}`}
                  style={{ height: `${Math.max(2, (p.value / max) * BAR_H)}px` }}
                >
                  <span className="sr-only">
                    {monthLabel(p.month, true)}
                    {p.partial ? " so far" : ""}: {formatCurrency(p.value)}
                  </span>
                </li>
              }
            />
            <TooltipContent>
              {monthLabel(p.month, true)}
              {p.partial ? " so far" : ""} · {formatCurrency(p.value)}
            </TooltipContent>
          </Tooltip>
        ))}
      </ol>
      <div aria-hidden className="text-caption text-muted-foreground flex justify-between">
        <span>{monthLabel(first.month)}</span>
        {/* The lighter last bar is this month so far: said under it, not by shade alone. */}
        <span data-testid="mrr-axis-last">
          {monthLabel(last.month)}
          {last.partial ? " so far" : ""}
        </span>
      </div>
    </figure>
  )
}

function CashDays({ value, previous, days }: { value: number; previous: number; days: CashDay[] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.value ?? 0, d.previous ?? 0]))
  return (
    <figure className="flex flex-col gap-2">
      {/* The total is one unit ("$4,322 / $3,900"): it never wraps; the caption wraps beside it at 390. */}
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-muted-foreground min-w-0">Cash this week · vs same time last week</span>
        <span
          data-testid="cash-week-total"
          className="text-body text-foreground shrink-0 font-medium whitespace-nowrap tabular-nums"
        >
          <span data-testid="cash-week-value">{formatCurrency(value)}</span>
          <span className="text-caption text-muted-foreground">
            {" / "}
            <span data-testid="cash-week-previous">{formatCurrency(previous)}</span>
          </span>
        </span>
      </figcaption>
      <ol aria-label="Cash in by day, Monday to Sunday" className="flex items-end gap-2" style={{ height: BAR_H }}>
        {days.map((d, i) => (
          <li key={d.date} data-testid="cash-day" data-date={d.date} className="flex flex-1 items-end gap-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-hidden
                    data-testid="cash-bar-last-week"
                    className={`${CASH_LAST_WEEK_BAR} flex-1 rounded-sm`}
                    style={{ height: d.previous === null ? 0 : `${Math.max(2, (d.previous / max) * BAR_H)}px` }}
                  />
                }
              />
              <TooltipContent>
                {weekdayLabel(i)} {formatDayShort(d.date)} · Last week{" "}
                {d.previous === null ? "no amount" : formatCurrency(d.previous)}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-hidden
                    data-testid="cash-bar-this-week"
                    className={`${CASH_THIS_WEEK_BAR} flex-1 rounded-sm`}
                    style={{ height: d.value === null ? 0 : `${Math.max(2, (d.value / max) * BAR_H)}px` }}
                  />
                }
              />
              <TooltipContent>
                {weekdayLabel(i)} {formatDayShort(d.date)} · This week{" "}
                {d.value === null ? "still ahead" : formatCurrency(d.value)}
              </TooltipContent>
            </Tooltip>
            <span className="sr-only">
              {weekdayLabel(i)} {formatDayShort(d.date)}:{" "}
              {d.value === null ? "still ahead" : `${formatCurrency(d.value)}, last week ${formatCurrency(d.previous ?? 0)}`}
            </span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="text-caption text-muted-foreground flex justify-between gap-2">
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">
            {weekdayLabel(i)}
          </span>
        ))}
      </div>
      <CashLegend />
    </figure>
  )
}
