import type { Metadata } from "next"

import { DashboardSection } from "@/components/chlk/dashboard-section"
import { PlayCard } from "@/components/chlk/play-card"
import { onePlayADay } from "@/lib/chlk/fixtures"

export const metadata: Metadata = { title: "Chlk — One Play a Day" }

/**
 * Figma 202:1085 / 202:1086 — Landscape Dashboard / ONE PLAY A DAY. The frame
 * is shell-only (empty lower band), so the featured play and concept panel
 * below are mock placeholders in the same visual language.
 */
export default function OnePlayADayPage() {
  const { date, play, concept, summary, coachingPoints, streak } = onePlayADay

  return (
    <DashboardSection
      title="One Play a Day"
      action={
        <span className="text-[9px] leading-[normal] text-white/60">
          {date} · {streak}-day streak
        </span>
      }
    >
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-[21px]">
        <PlayCard play={play} />
        <div className="flex flex-col gap-3 rounded-[13px] bg-[#222222] p-5">
          <p className="text-[10px] font-semibold uppercase leading-[normal] tracking-[1px] text-[#9cccfc]">
            Today&apos;s concept
          </p>
          <h3 className="text-[18px] font-bold leading-tight text-white">{concept}</h3>
          <p className="text-[11px] leading-[16px] text-white/80">{summary}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {coachingPoints.map((point) => (
              <li key={point} className="flex gap-2 text-[10px] leading-[14px] text-white/80">
                <span aria-hidden className="mt-[5px] size-1 shrink-0 rounded-full bg-[#2b76ba]" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex gap-2 pt-2">
            <button
              type="button"
              className="h-[26px] rounded-[4px] bg-[#2b76ba] px-3 text-[10px] font-semibold text-white hover:bg-[#3382c8]"
            >
              Open in Diagramming Tool
            </button>
            <button
              type="button"
              className="h-[26px] rounded-[4px] border-[0.35px] border-[#d9d9d9] bg-[#3f3f3f] px-3 text-[10px] font-semibold text-white hover:bg-[#4a4a4a]"
            >
              Save to playbook
            </button>
          </div>
        </div>
      </div>
    </DashboardSection>
  )
}
