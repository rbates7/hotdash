import type { Metadata } from "next"

import { DashboardSection } from "@/components/chlk/dashboard-section"
import { toolboxCards } from "@/lib/chlk/fixtures"

export const metadata: Metadata = { title: "Chlk — Tutorials" }

/** Simple placeholder — Tutorials has no frame in the handoff. */
export default function TutorialsPage() {
  return (
    <DashboardSection title="Tutorials">
      <div className="max-w-[520px] rounded-[13px] border border-[#2a2a2a] bg-[#1f1f1f] p-5">
        <p className="text-[10px] font-semibold uppercase leading-[normal] tracking-[1px] text-[#9cccfc]">
          Coming to this preview
        </p>
        <h3 className="mt-2 text-[16px] font-bold leading-tight text-white">
          Short walkthroughs for every tool in the toolbox
        </h3>
        <p className="mt-2 text-[11px] leading-[16px] text-white/70">
          Tutorials are live in Chlk, but this screen has no design frame yet. When it does, it
          will list a short video for each of the three coaching tools.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {toolboxCards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between rounded-[8px] bg-[#2a2a2a] px-3 py-2 text-[10px] text-white/80"
            >
              <span className="font-semibold">{card.title.replace("\n", " ")}</span>
              <span className="uppercase tracking-[1px] text-white/50">{card.tool}</span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardSection>
  )
}
