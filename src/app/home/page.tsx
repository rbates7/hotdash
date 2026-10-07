import { now } from "@/lib/clock"
import { pulseLabel } from "@/lib/home"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"

export const metadata = {
  title: "Home · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or the lede and every "days left" would be frozen at deploy time.
export const dynamic = "force-dynamic"

export default function HomePage() {
  // One instant per request. The lede, the board's "days left" and the
  // inbox's "18m" are all measured from it, and the client hydrates against
  // the same value.
  const at = now()

  return (
    <IssuesProvider nowMs={at.getTime()}>
      <HomeScreen pulse={pulseLabel(at)} />
    </IssuesProvider>
  )
}
