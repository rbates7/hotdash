import { CardGrid, DashboardSection } from "@/components/chlk/dashboard-section"
import { PlayCard } from "@/components/chlk/play-card"
import { recentPlays } from "@/lib/chlk/fixtures"

export default function RecentsPage() {
  return (
    <DashboardSection title="Recents">
      <CardGrid>
        {recentPlays.map((play) => (
          <li key={play.id}>
            <PlayCard play={play} />
          </li>
        ))}
      </CardGrid>
    </DashboardSection>
  )
}
