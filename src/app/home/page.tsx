import { now } from "@/lib/clock"
import { pulseLabel } from "@/lib/home"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"

export const metadata = {
  title: "Home · Chlk",
}

export default function HomePage() {
  // Same clock as the board's "days left" and the inbox's "18m", so the
  // page never contradicts itself. The route is dynamic (the layout reads a
  // cookie), so swapping the clock to real time later needs no other change.
  const pulse = pulseLabel(now())

  return (
    <IssuesProvider>
      <HomeScreen pulse={pulse} />
    </IssuesProvider>
  )
}
