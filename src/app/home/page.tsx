import { now } from "@/lib/clock"
import { pulseLabel } from "@/lib/home"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"

export const metadata = {
  title: "Home · Chlk",
}

export default function HomePage() {
  // One instant per request (the route is dynamic: the layout reads a
  // cookie). The lede, the board's "days left" and the inbox's "18m" are all
  // measured from it, and the client hydrates against the same value.
  const at = now()

  return (
    <IssuesProvider nowMs={at.getTime()}>
      <HomeScreen pulse={pulseLabel(at)} />
    </IssuesProvider>
  )
}
