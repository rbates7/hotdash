import { todayIn } from "@/lib/clock"
import { CRASHES_LABEL, crashKpi } from "@/lib/bugs"
import { DeltaPill } from "@/components/home/kpi-strip"
import { SampleDataTag } from "@/components/sample-data"

/**
 * Crashes in the trailing seven Central calendar days, against the seven
 * before. Sentry is not connected: the figure is the shared sample spread
 * laid over the real calendar, and the chip says so.
 */
export function CrashCountCard({ now }: { now: Date }) {
  const kpi = crashKpi(todayIn(now))
  return (
    <article
      aria-label={CRASHES_LABEL}
      className="bg-surface border-surface-border flex min-h-[124px] w-full flex-col rounded-xl border px-[18px] pt-[18px] pb-4 sm:max-w-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-label font-semibold tracking-tight">{kpi.label}</h2>
        <SampleDataTag />
      </div>
      <p
        data-testid="crash-count"
        className="mt-3.5 text-[26px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums"
      >
        {kpi.value}
      </p>
      <p className="text-micro text-muted-foreground mt-1.5 font-medium tracking-tight">
        Last 7 days · Sentry not connected
      </p>
      <p className="mt-auto pt-3">
        <DeltaPill kpi={kpi} />
      </p>
    </article>
  )
}
