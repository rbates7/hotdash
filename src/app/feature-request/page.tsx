import { now } from "@/lib/clock"
import { FeatureRequestsProvider } from "@/components/feature-request/feature-requests-store"
import { FeatureRequestHeader } from "@/components/feature-request/feature-request-header"
import { RequestBoard } from "@/components/feature-request/request-board"

export const metadata = {
  title: "Feature Request · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or the seed's dates would be frozen at deploy time.
export const dynamic = "force-dynamic"

export default function FeatureRequestPage() {
  // One instant per request. The seed's dates, every "Added Sat, Aug 22"
  // (`formatRelative` long), and every stamp on an edit are measured from
  // it, and the client hydrates against the same value. Edit stamps then
  // read `now()` at the click; Reset and cross-tab re-seeds use reseedNowMs.
  const at = now()

  return (
    <FeatureRequestsProvider nowMs={at.getTime()}>
      <div className="flex min-w-0 flex-col gap-5">
        <FeatureRequestHeader />
        <RequestBoard />
      </div>
    </FeatureRequestsProvider>
  )
}
