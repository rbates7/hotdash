import { now } from "@/lib/clock"
import { DealsPersistenceNote } from "@/components/sales-opportunities/deals-persistence-note"
import { DealsProvider } from "@/components/sales-opportunities/deals-store"
import { DealsScreen } from "@/components/sales-opportunities/deals-screen"
import { SampleDataTag } from "@/components/sample-data"

export const metadata = {
  title: "Sales Opportunities · Chlk",
}

// Render per request, never at build time: `now()` below must be the time
// of the visit, not of the deploy.
export const dynamic = "force-dynamic"

export default function SalesOpportunitiesPage() {
  // The one read of the clock for this request. The store receives the
  // instant and derives today (Central), last-touch (`long` style) and
  // "overdue" from it, so the server HTML and the client's hydration
  // describe the same moment even across midnight.
  const nowMs = now().getTime()

  return (
    <DealsProvider nowMs={nowMs}>
      <section aria-label="Sales Opportunities" className="flex min-w-0 flex-col gap-[18px]">
        <header className="flex min-h-10 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-display-sm font-semibold tracking-tight">Sales Opportunities</h1>
            <p className="text-label text-muted-foreground mt-1">
              Live deals only — a hunt becomes a deal when someone is talking.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <DealsPersistenceNote />
            <SampleDataTag className="h-6 px-2" />
          </div>
        </header>
        <DealsScreen />
      </section>
    </DealsProvider>
  )
}
