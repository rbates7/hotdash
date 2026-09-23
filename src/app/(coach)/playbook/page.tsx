import type { Metadata } from "next"

import { DashboardSection } from "@/components/chlk/dashboard-section"
import {
  FilterChip,
  FolderCard,
  LibraryPlayCard,
  SubsectionLabel,
} from "@/components/chlk/playbook-library"
import { folders, libraryFilters, unorganizedPlays } from "@/lib/chlk/fixtures"

export const metadata: Metadata = { title: "Chlk — Playbook Library" }

/** Figma 202:1008 / 202:1009 — Landscape Dashboard / PLAYBOOK LIBRARY. */
export default function PlaybookLibraryPage() {
  return (
    <DashboardSection title="Playbook Library" contentGap="mt-[27px]">
      <div className="flex gap-[9px]" role="group" aria-label="Filter plays">
        {libraryFilters.map((filter) => (
          <FilterChip key={filter} label={filter} />
        ))}
      </div>

      <div className="mt-[15px]">
        <SubsectionLabel title="Folders" count={folders.length} />
        <ul className="mt-[19px] grid grid-cols-4 gap-x-3 gap-y-3">
          {folders.map((folder) => (
            <li key={folder.id}>
              <FolderCard folder={folder} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-[22px]">
        <SubsectionLabel title="Unorganized Plays" count={unorganizedPlays.length} />
        <ul className="mt-[18px] grid grid-cols-4 gap-x-4 gap-y-4">
          {unorganizedPlays.map((play) => (
            <li key={play.id}>
              <LibraryPlayCard play={play} />
            </li>
          ))}
        </ul>
      </div>
    </DashboardSection>
  )
}
