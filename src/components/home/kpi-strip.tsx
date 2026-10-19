import { CASH_NOTE, MRR_NOTE } from "@/lib/live-metrics"
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react"

import { kpiTone, type Kpi, type KpiTone } from "@/lib/home"
import { cn } from "@/lib/utils"
import { SampleDataTag } from "@/components/sample-data"
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

const SAMPLE_LABEL_ID = "kpi-sample-data"

/**
 * Strip-level note: says plainly that the figures are invented.
 * `reserve` is an empty box the label's size instead (no words, so nothing
 * claims "sample" before Stripe answers), so the strip is the same height —
 * wrapping on a phone included — whether Stripe is loading, live or not
 * connected. Keep its width in step with the label's (281px).
 */
export function SampleDataLabel({ reserve = false }: { reserve?: boolean }) {
  if (reserve) return <span aria-hidden data-testid="kpi-sample-reserve" className="h-6 w-[282px] max-w-full" />
  return (
    <p id={SAMPLE_LABEL_ID} role="note" data-testid="kpi-sample-label" className="inline-flex">
      <SampleDataTag className="text-caption h-6 px-2">· figures are invented, not live</SampleDataTag>
    </p>
  )
}

const isSample = (kpi: Kpi) => !kpi.source || kpi.source === "sample"

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const sample = isSample(kpi)
  const loading = kpi.source === "loading"
  const notConnected = kpi.source === "not_connected"
  return (
    <article
      aria-label={kpi.label}
      aria-describedby={sample ? SAMPLE_LABEL_ID : undefined}
      aria-busy={loading || undefined}
      data-source={kpi.source ?? "sample"}
      className="bg-surface border-surface-border flex min-h-[124px] flex-col rounded-xl border px-[18px] pt-[18px] pb-4"
    >
      {/* min-h-5: the Sample tag's height, held when there is no tag. */}
      <div className="flex min-h-5 items-start justify-between gap-2">
        <p className="text-label font-semibold tracking-tight">{kpi.label}</p>
        {sample && <SampleDataTag />}
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
      {/* A Not connected card keeps the note's room (hidden) so the strip does not shift. */}
      {(kpi.id === "cash-this-week" || kpi.id === "mrr") && (
        <p
          data-testid="kpi-note"
          aria-hidden={notConnected || undefined}
          className={cn("text-caption text-muted-foreground mt-1.5 tracking-tight", notConnected && "invisible")}
        >
          {kpi.id === "mrr" ? MRR_NOTE : CASH_NOTE}
        </p>
      )}
      {kpi.updated && (
        <p data-testid="kpi-updated" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
          {kpi.updated}
        </p>
      )}
      {/* The total's three groups; a sample or loading card keeps their room. */}
      {kpi.id === "subscribers" && (
        <SubscriberBreakdown breakdown={kpi.breakdown} reserve={!kpi.breakdown} className="mt-2.5" />
      )}
      {/* Always a pill's height: a loading card or one with no comparison
          keeps the row, so the strip does not grow when the figures land. */}
      <p className="mt-auto pt-3">
        {kpi.delta ? (
          <DeltaPill kpi={kpi} />
        ) : (
          <span aria-hidden className="invisible">
            <DeltaPill kpi={{ ...kpi, delta: "\u00a0" }} />
          </span>
        )}
      </p>
    </article>
  )
}

export function KpiStrip({ kpis, title }: { kpis: Kpi[]; title: string }) {
  return (
    <section aria-label="KPI strip" className="flex shrink-0 flex-col gap-2.5">
      <div className={HOME_KPI_HEAD}>
        <h2 className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
          {title}
        </h2>
        <SampleDataLabel reserve={!kpis.some(isSample)} />
      </div>
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          // Two cards split the row; three or more fan out to four columns.
          kpis.length > 2 && "xl:grid-cols-4"
        )}
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
    </section>
  )
}
