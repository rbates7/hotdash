import { now } from "@/lib/clock"
import { RoadmapHeader } from "@/components/product-roadmap/roadmap-header"
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
        <RoadmapHeader />
        <RoadmapBoard />
      </div>
    </RoadmapProvider>
  )
}
