import { now } from "@/lib/clock"
import { HeaderActions } from "@/components/product-roadmap/header-actions"
import { RoadmapBoard } from "@/components/product-roadmap/roadmap-board"
import { RoadmapProvider } from "@/components/product-roadmap/roadmap-store"

export const metadata = {
  title: "Product Roadmap · Chlk",
}

// Render per request, never at build time: the seed's windows and dates are
// measured from the request clock, and a prerendered page would freeze
// "today" to whenever the build ran.
export const dynamic = "force-dynamic"

export default function ProductRoadmapPage() {
  // The one clock read for this screen. Everything below receives it.
  const nowMs = now().getTime()

  return (
    <RoadmapProvider nowMs={nowMs}>
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex min-h-10 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-display-sm font-semibold tracking-tight">Product Roadmap</h1>
            <p className="text-label text-muted-foreground mt-1 tracking-tight">
              Signed bets, in order. Tickets live in Agent Workplace.
            </p>
          </div>
          <HeaderActions />
        </header>
        <RoadmapBoard />
      </div>
    </RoadmapProvider>
  )
}
