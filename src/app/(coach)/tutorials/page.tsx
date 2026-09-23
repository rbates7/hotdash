import type { Metadata } from "next"

import { CardGrid, DashboardSection } from "@/components/chlk/dashboard-section"
import { PlayCard } from "@/components/chlk/play-card"
import { tutorials } from "@/lib/chlk/fixtures"

export const metadata: Metadata = { title: "Chlk — Tutorials" }

export default function TutorialsPage() {
  return (
    <DashboardSection
      title="Tutorials"
      action={
        <span className="text-[9px] leading-normal text-white/60">
          Short walkthroughs of every tool in the toolbox
        </span>
      }
    >
      <CardGrid>
        {tutorials.map((tutorial) => (
          <li key={tutorial.id}>
            <PlayCard
              play={{
                id: tutorial.id,
                title: tutorial.title,
                meta: `Video · ${tutorial.duration}`,
                thumbnail: tutorial.thumbnail,
              }}
            />
          </li>
        ))}
      </CardGrid>
    </DashboardSection>
  )
}
