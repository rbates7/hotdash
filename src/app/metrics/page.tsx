import { Suspense } from "react"
import { CalendarIcon } from "lucide-react"

import { formatPeriod, now, periodEnding, todayIn } from "@/lib/clock"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { MetricsPersistenceNote } from "@/components/metrics/metrics-persistence-note"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"

export const metadata = {
  title: "Metrics · Chlk",
}

// Render per request, never at build time: `now()` below must be the time
// of the visit, not of the deploy.
export const dynamic = "force-dynamic"

export default function MetricsPage() {
  // The one read of the clock for this request. Everything below receives
  // the resulting calendar day, so the server HTML and the client's
  // hydration describe the same "today" even across midnight.
  const today = todayIn(now())
  const period = periodEnding(today)

  return (
    <MetricsProvider today={today}>
      <div className="flex min-w-0 flex-col gap-2.5">
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-4">
          <h1 className="text-display-sm font-semibold tracking-tight">Metrics</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <MetricsPersistenceNote />
            <SampleDataTag className="h-6 px-2" />
            {/* Shows the real trailing four weeks, but is not a picker yet
                (reqs: Open). Marked disabled rather than wired to a control
                that would not filter anything. */}
            <span
              aria-disabled="true"
              data-testid="date-range"
              title="Trailing four weeks. Date range picker is not wired yet"
              className="bg-surface border-surface-border text-label inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-medium select-none"
            >
              <CalendarIcon className="text-muted-foreground size-[15px]" aria-hidden />
              {formatPeriod(period)}
            </span>
          </div>
        </header>
        <SampleDataNotice />
        {/* MetricsTabs reads the tab from the URL, so it needs a Suspense
            boundary around useSearchParams. */}
        <Suspense fallback={null}>
          <MetricsTabs />
        </Suspense>
      </div>
    </MetricsProvider>
  )
}
