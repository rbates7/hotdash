"use client"

import { formatWallClock, formatDayShort } from "@/lib/clock"
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

/**
 * The MRR chart (one bar per month, this month partial) and Cash this week
 * by day beside last week, from Stripe through `/api/stripe/mrr-cash`.
 * There is no sample state: before the first sync it is a placeholder that
 * says Connecting…, and with no key it says Not connected.
 */
export function MrrCashPanel() {
  const { timeZone } = useSettings()
  return <MrrCashPanelView state={panelStateOf(useMrrCashView())} timeZone={timeZone} />
}

export function MrrCashPanelView({ state, timeZone }: { state: MrrCashPanelState; timeZone: string }) {
  return (
    <section
      aria-label="MRR and cash this week"
      aria-busy={state.kind === "loading" || state.kind === "connecting"}
      data-testid="mrr-cash-panel"
      data-state={state.kind}
      className="border-surface-border bg-card flex w-full flex-col gap-4 rounded-xl border p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-body text-foreground font-medium">MRR and cash this week</h2>
        {state.kind === "live" && state.stale && (
          <p data-testid="mrr-cash-updated" className="text-caption text-muted-foreground">
            Last updated {formatWallClock(state.lastSyncedAt, timeZone)}
          </p>
        )}
      </header>
      {state.kind === "live" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <MrrBars points={state.mrr.points} />
          <CashDays value={state.cash.value} previous={state.cash.previous} days={state.cash.days} />
        </div>
      ) : (
        <Placeholder kind={state.kind} />
      )}
    </section>
  )
}

function Placeholder({ kind }: { kind: "loading" | "connecting" | "not_connected" }) {
  const text =
    kind === "not_connected" ? "Stripe not connected" : kind === "connecting" ? "Connecting… first sync in progress" : null
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

function MrrBars({ points }: { points: MrrPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.value))
  const first = points[0]
  const last = points[points.length - 1]
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-caption text-muted-foreground">MRR · {points.length} months</span>
        <span data-testid="mrr-chart-latest" className="text-body text-foreground font-medium tabular-nums">
          {formatCurrency(last.value)}
        </span>
      </figcaption>
      <ol
        aria-label={`MRR by month, ${monthLabel(first.month, true)} to ${monthLabel(last.month, true)}, ${formatCurrency(first.value)} to ${formatCurrency(last.value)}`}
        className="flex items-end gap-1"
        style={{ height: BAR_H }}
      >
        {points.map((p) => (
          <li
            key={p.month}
            data-testid="mrr-bar"
            data-month={p.month}
            title={`${monthLabel(p.month, true)}${p.partial ? " (so far)" : ""}: ${formatCurrency(p.value)}`}
            className={`flex-1 rounded-sm ${p.partial ? "bg-primary/50" : "bg-primary"}`}
            style={{ height: `${Math.max(2, (p.value / max) * BAR_H)}px` }}
          >
            <span className="sr-only">
              {monthLabel(p.month, true)}
              {p.partial ? " so far" : ""}: {formatCurrency(p.value)}
            </span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="text-caption text-muted-foreground flex justify-between">
        <span>{monthLabel(first.month)}</span>
        <span>{monthLabel(last.month)}</span>
      </div>
    </figure>
  )
}

function CashDays({ value, previous, days }: { value: number; previous: number; days: CashDay[] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.value ?? 0, d.previous ?? 0]))
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-caption text-muted-foreground">Cash this week · vs same time last week</span>
        <span data-testid="cash-week-total" className="text-body text-foreground font-medium tabular-nums">
          {formatCurrency(value)}
          <span className="text-caption text-muted-foreground"> / {formatCurrency(previous)}</span>
        </span>
      </figcaption>
      <ol aria-label="Cash in by day, Monday to Sunday" className="flex items-end gap-2" style={{ height: BAR_H }}>
        {days.map((d, i) => (
          <li key={d.date} data-testid="cash-day" data-date={d.date} className="flex flex-1 items-end gap-0.5">
            <span
              aria-hidden
              className="bg-muted-foreground/30 flex-1 rounded-sm"
              style={{ height: d.previous === null ? 0 : `${Math.max(2, (d.previous / max) * BAR_H)}px` }}
            />
            <span
              aria-hidden
              className="bg-primary flex-1 rounded-sm"
              style={{ height: d.value === null ? 0 : `${Math.max(2, (d.value / max) * BAR_H)}px` }}
            />
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
    </figure>
  )
}
