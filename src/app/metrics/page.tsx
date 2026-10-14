import { Suspense } from "react"

import { now } from "@/lib/clock"
import { MetricsHeaderPeriod } from "@/components/metrics/metrics-header-period"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { MetricsPersistenceNote } from "@/components/metrics/metrics-persistence-note"
import { METRICS_HEADER, METRICS_HEADER_META } from "@/components/metrics/responsive"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"

export const metadata = {
  title: "Metrics · Chlk",
}

// Render per request, never at build time: `now()` below must be the time
// of the visit, not of the deploy.
export const dynamic = "force-dynamic"

export default function MetricsPage() {
  // The one read of the clock for this request. The store holds it as its
  // clock, so the server HTML and the client's hydration describe the same
  // "today" even across midnight; a Reset later moves the store's clock.
  const nowMs = now().getTime()

  return (
    <MetricsProvider nowMs={nowMs}>
      <div className="flex min-w-0 flex-col gap-2.5">
        <header className={METRICS_HEADER}>
          <h1 className="text-display-sm font-semibold tracking-tight">Metrics</h1>
          <div className={METRICS_HEADER_META}>
            <MetricsPersistenceNote />
            <SampleDataTag className="h-6 px-2" />
            <MetricsHeaderPeriod />
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
