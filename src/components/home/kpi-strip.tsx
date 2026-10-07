import { ArrowDownIcon, ArrowUpIcon, FlaskConicalIcon, MinusIcon } from "lucide-react"

import { kpiTone, type Kpi, type KpiTone } from "@/lib/home"
import { cn } from "@/lib/utils"

const TONE_CLASS: Record<KpiTone, string> = {
  good: "bg-success/10 text-success",
  bad: "bg-destructive/10 text-destructive",
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
 * Amber in both themes (the same pair the board's blocker chip uses), so it
 * reads against the canvas in light and dark rather than hiding in the
 * muted text.
 */
const SAMPLE_TONE =
  "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"

/** Strip-level note: says plainly that the figures are invented. */
export function SampleDataLabel() {
  return (
    <p
      id={SAMPLE_LABEL_ID}
      role="note"
      data-testid="kpi-sample-label"
      className={cn(
        "text-caption inline-flex w-fit items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 font-semibold tracking-tight",
        SAMPLE_TONE
      )}
    >
      <FlaskConicalIcon className="size-3.5" aria-hidden />
      Sample data
      <span className="font-medium text-amber-700/90 dark:text-amber-200/80">
        · figures are invented, not live
      </span>
    </p>
  )
}

/** Per-card chip, so no single number can be read without the caveat. */
export function SampleChip() {
  return (
    <span
      data-testid="kpi-sample-chip"
      className={cn(
        "text-micro inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full pr-1.5 pl-1 font-semibold tracking-tight",
        SAMPLE_TONE
      )}
    >
      <FlaskConicalIcon className="size-3" aria-hidden />
      Sample data
    </span>
  )
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <article
      aria-label={kpi.label}
      aria-describedby={SAMPLE_LABEL_ID}
      className="bg-surface border-surface-border flex min-h-[124px] flex-col rounded-xl border px-[18px] pt-[18px] pb-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-label font-semibold tracking-tight">{kpi.label}</p>
        <SampleChip />
      </div>
      <p className="mt-3.5 text-[26px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums">
        {kpi.value}
      </p>
      <p className="mt-auto pt-3">
        <DeltaPill kpi={kpi} />
      </p>
    </article>
  )
}

export function KpiStrip({ kpis, title }: { kpis: Kpi[]; title: string }) {
  return (
    <section aria-label="KPI strip" className="flex shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
          {title}
        </h2>
        <SampleDataLabel />
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
