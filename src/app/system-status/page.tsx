import { now } from "@/lib/clock"
import { StatusScreen } from "@/components/system-status/status-screen"

export const metadata = {
  title: "System Status · Chlk",
}

// Render per request, never at build time: `now()` below must be the time
// of the visit, not of the deploy, or every "checked N min ago" would age
// from the last deploy.
export const dynamic = "force-dynamic"

/**
 * Always the real page: nothing is polled yet, so no checks and Not
 * connected. There is no `?preview=` route; the seeded views exist only in
 * the unit tests (StatusScreen's `scenario` prop).
 */
export default function SystemStatusPage() {
  // The one read of the clock for this request. The screen is pure below
  // this line: every relative figure is measured from this instant.
  const nowMs = now().getTime()
  return <StatusScreen nowMs={nowMs} />
}
