import { pulseLabel } from "@/lib/home"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"

export const metadata = {
  title: "Home · Chlk",
}

export default function HomePage() {
  // Rendered per request (the layout reads a cookie, so the route is
  // dynamic): the lede names today's weekday, not the build's.
  const pulse = pulseLabel(new Date())

  return (
    <IssuesProvider>
      <HomeScreen pulse={pulse} />
    </IssuesProvider>
  )
}
