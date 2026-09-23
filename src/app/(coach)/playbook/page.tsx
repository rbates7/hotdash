import type { Metadata } from "next"

import { CardGrid, DashboardSection } from "@/components/chlk/dashboard-section"
import { PlayCard } from "@/components/chlk/play-card"
import { playbooks } from "@/lib/chlk/fixtures"

export const metadata: Metadata = { title: "Chlk — Playbook Library" }

export default function PlaybookLibraryPage() {
  return (
    <DashboardSection
      title="Playbook Library"
      action={
        <span className="text-[9px] leading-normal text-white/60">
          {playbooks.length} playbooks ·{" "}
          {playbooks.reduce((sum, p) => sum + p.playCount, 0)} plays
        </span>
      }
    >
      <CardGrid>
        {playbooks.map((playbook) => (
          <li key={playbook.id}>
            <PlayCard
              play={{
                id: playbook.id,
                title: playbook.name,
                meta: `${playbook.playCount} plays · ${playbook.updated}`,
                thumbnail: playbook.thumbnail,
              }}
            />
          </li>
        ))}
      </CardGrid>
    </DashboardSection>
  )
}
