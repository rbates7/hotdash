import { Suspense } from "react"
import { CalendarIcon } from "lucide-react"

import { DATE_RANGE_LABEL } from "@/lib/metrics-fixture"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { PersistenceNote } from "@/components/metrics/persistence-note"
import { SAMPLE_DATA_LABEL, SampleDataNotice } from "@/components/metrics/sample-data"

export const metadata = {
  title: "Metrics · Chlk",
}

export default function MetricsPage() {
  return (
    <MetricsProvider>
      <div className="flex min-w-0 flex-col gap-2.5">
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-4">
          <h1 className="text-display-sm font-semibold tracking-tight">Metrics</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <PersistenceNote />
            <span className="text-muted-foreground border-surface-border bg-surface rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase">
              {SAMPLE_DATA_LABEL}
            </span>
            {/* Decorative for this pass (reqs: Open). Marked disabled rather
                than wired to a picker that would not filter anything. */}
            <span
              aria-disabled="true"
              title="Date range picker is not wired yet"
              className="bg-surface border-surface-border text-label inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-medium select-none"
            >
              <CalendarIcon className="text-muted-foreground size-[15px]" aria-hidden />
              {DATE_RANGE_LABEL}
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
