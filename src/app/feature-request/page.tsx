import { FeatureRequestsProvider } from "@/components/feature-request/feature-requests-store"
import { HeaderActions } from "@/components/feature-request/header-actions"
import { RequestBoard } from "@/components/feature-request/request-board"

export const metadata = {
  title: "Feature Request · Chlk",
}

export default function FeatureRequestPage() {
  return (
    <FeatureRequestsProvider>
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
