import { now } from "@/lib/clock"
import { FeatureRequestsProvider } from "@/components/feature-request/feature-requests-store"
import { HeaderActions } from "@/components/feature-request/header-actions"
import { RequestBoard } from "@/components/feature-request/request-board"

export const metadata = {
  title: "Feature Request · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or the seed's dates would be frozen at deploy time.
export const dynamic = "force-dynamic"

export default function FeatureRequestPage() {
  // One instant per request. The seed's dates, every "Added 2 days ago" and
  // every stamp on an edit are measured from it, and the client hydrates
  // against the same value. Nothing below reads the clock again.
  const at = now()

  return (
    <FeatureRequestsProvider nowMs={at.getTime()}>
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex min-h-10 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-display-sm font-semibold tracking-tight">
              Feature Request
            </h1>
            <p className="text-label text-muted-foreground mt-1 tracking-tight">
              Dan&rsquo;s intake · funnels into Product Roadmap
            </p>
          </div>
          <HeaderActions />
        </header>
        <RequestBoard />
      </div>
    </FeatureRequestsProvider>
  )
}
