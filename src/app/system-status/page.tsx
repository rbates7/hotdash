import { now } from "@/lib/clock"
import { DEFAULT_SCENARIO, PREVIEW_PARAM, isScenario } from "@/lib/system-status"
import { StatusScreen } from "@/components/system-status/status-screen"

export const metadata = {
  title: "System Status · Chlk",
}

// Render per request, never at build time: `now()` below must be the time
// of the visit, not of the deploy, or every "checked N min ago" would age
// from the last deploy.
export const dynamic = "force-dynamic"

export default async function SystemStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // The one read of the clock for this request. The screen is pure below
  // this line: every relative figure is measured from this instant.
  const nowMs = now().getTime()
  const requested = (await searchParams)[PREVIEW_PARAM]
  const scenario = isScenario(requested) ? requested : DEFAULT_SCENARIO

  return <StatusScreen nowMs={nowMs} scenario={scenario} />
}
