import * as React from "react"
import { CASH_NOTE, MRR_NOTE } from "@/lib/live-metrics"
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react"

import { kpiTone, type Kpi, type KpiTone } from "@/lib/home"
import { cn } from "@/lib/utils"
import { SubscriberBreakdown } from "@/components/subscriber-breakdown"
import { HOME_KPI_HEAD } from "@/components/home/responsive"
import { ConnectingBadge, NotConnectedBadge } from "@/components/home/not-connected"

const TONE_CLASS: Record<KpiTone, string> = {
  good: "bg-success/10 text-success-text",
  bad: "bg-destructive/10 text-danger-text",
  flat: "bg-muted text-muted-foreground",
}

const DIRECTION_ICON = {
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  flat: MinusIcon,
} as const

const DIRECTION_WORD = { up: "Up", down: "Down", flat: "Flat" } as const

export function DeltaPill({ kpi }: { kpi: Kpi }) {
  const tone = kpiTone(kpi)
  const Icon = DIRECTION_ICON[kpi.direction]
  return (
    <span
      data-tone={tone}
      className={cn(
        "text-caption inline-flex items-center gap-[3px] rounded-full py-[3px] pr-2 pl-1.5 leading-[1.2] font-medium tracking-tight",
        TONE_CLASS[tone]
      )}
    >
      <Icon className="size-[11px] stroke-[2.25]" aria-hidden />
      <span className="sr-only">{DIRECTION_WORD[kpi.direction]} </span>
      {kpi.delta}
    </span>
  )
}

/**
 * The strip head's right-hand box: empty, the size the old Sample data
 * label had, so the head keeps develop's height (wrapping on a phone
 * included). No card on Home is ever sample: each is Stripe's figure, a
 * loading placeholder or Not connected (`liveKpis`).
 */
function HeadReserve() {
  return <span aria-hidden data-testid="kpi-sample-reserve" className="h-6 w-[282px] max-w-full" />
}

/** Stripe feeds these cards; anything else has no source yet. */
const STRIPE_KPIS = new Set(["subscribers", "cash-this-week", "mrr", "arr", "churn", "revenue", "trials"])

/** The one muted line under a Not connected card's dash (Deke, #67). */
export function notConnectedHint(id: string) {
  return STRIPE_KPIS.has(id) ? "Connect Stripe to see this" : "No source connected yet"
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const loading = kpi.source === "loading"
  const notConnected = kpi.source === "not_connected"
  return (
    <article
      aria-label={kpi.label}
      aria-busy={loading || undefined}
      data-source={kpi.source}
      className={cn(
        "bg-surface border-surface-border flex flex-col rounded-xl border px-[18px] pt-[18px] pb-4",
        // Deke (#67): a Not connected card is only as tall as its content.
        // and does not stretch to the row's height (self-start).
        notConnected ? "self-start" : "min-h-[124px]"
      )}
    >
      {/* min-h-5: a badge's height, held when there is none. */}
      <div className="flex min-h-5 items-start justify-between gap-2">
        <p className="text-label font-semibold tracking-tight">{kpi.label}</p>
        {notConnected && <NotConnectedBadge className="h-5 px-2" />}
        {loading && kpi.connecting && <ConnectingBadge className="h-5 px-2" />}
      </div>
      <p
        data-testid="kpi-value"
        className={cn(
          "mt-3.5 text-[26px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums",
          (loading || notConnected) && "text-muted-foreground"
        )}
      >
        {/* Placeholders: the dash is decoration; screen readers get the words (sr-only, not aria-label on a span). */}
        {loading ? (
          <span data-testid="kpi-placeholder">
            <span aria-hidden>–</span>
            <span className="sr-only">Loading</span>
          </span>
        ) : notConnected ? (
          <span data-testid="kpi-placeholder">
            <span aria-hidden>{kpi.value}</span>
            <span className="sr-only">No figure</span>
          </span>
        ) : (
          kpi.value
        )}
      </p>
      {/* Not connected (Deke, #67): one muted line, nothing reserved, so the
          card is only as tall as its content. Loading keeps the note's room,
          hidden, so the strip does not shift when the figures land. */}
      {notConnected && (
        <p data-testid="kpi-not-connected-hint" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
          {notConnectedHint(kpi.id)}
        </p>
      )}
      {!notConnected && (kpi.id === "cash-this-week" || kpi.id === "mrr") && (
        <p
          data-testid="kpi-note"
          aria-hidden={loading || undefined}
          className={cn("text-caption text-muted-foreground mt-1.5 tracking-tight", loading && "invisible")}
        >
          {kpi.id === "mrr" ? MRR_NOTE : CASH_NOTE}
        </p>
      )}
      {kpi.updated && (
        <p data-testid="kpi-updated" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
          {kpi.updated}
        </p>
      )}
      {/* The total's three groups; a loading or Not connected card keeps their room. */}
      {kpi.id === "subscribers" && !notConnected && (
        <SubscriberBreakdown breakdown={kpi.breakdown} reserve={!kpi.breakdown} className="mt-2.5" />
      )}
      {/* Always a pill's height: a loading card or one with no comparison
          keeps the row, so the strip does not grow when the figures land. */}
      {!notConnected && (
        <p className="mt-auto pt-3">
          {kpi.delta ? (
            <DeltaPill kpi={kpi} />
          ) : (
            <span aria-hidden className="invisible">
              <DeltaPill kpi={{ ...kpi, delta: "\u00a0" }} />
            </span>
          )}
        </p>
      )}
    </article>
  )
}

/** `children`: extra cards in the same grid (Home's Paying coaches tile, #67). */
export function KpiStrip({ kpis, title, children }: { kpis: Kpi[]; title: string; children?: React.ReactNode }) {
  const extra = React.Children.count(children)
  const cards = kpis.length + extra
  return (
    <section aria-label="KPI strip" className="flex shrink-0 flex-col gap-2.5">
      <div className={HOME_KPI_HEAD}>
        <h2 className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
          {title}
        </h2>
        <HeadReserve />
      </div>
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          // Deke (#67): matched heights on desktop only; below 1024px each
          // card is as tall as its own content.
          extra > 0 && "items-start lg:items-stretch",
          // Two cards split the row; three or more fan out to four columns.
          // With extra cards (#67) the row holds exactly that many at xl, so
          // Home stays one strip high and still fits 1440×900.
          extra === 0 && kpis.length > 2 && "xl:grid-cols-4",
          // Deke (#67): three even columns from 1024px; below that the last
          // card spans the two-column row, so there is no empty slot.
          extra > 0 && cards === 3 && "lg:grid-cols-3",
          extra > 0 && cards === 3 && "sm:[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1",
          extra > 0 && cards === 4 && "lg:grid-cols-4",
          extra > 0 && cards > 4 && "xl:grid-cols-5"
        )}
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
        {children}
      </div>
    </section>
  )
}
