/* eslint-disable @next/next/no-img-element -- static Figma SVG export. */

import { ArrowUpRight, ChevronDown, EllipsisVertical, Folder } from "lucide-react"

import { PlayDiagram } from "@/components/chlk/play-diagram"
import type { FolderData, LibraryPlayData } from "@/lib/chlk/fixtures"

/** Inert dropdown-style filter chip (Scheme ▾, Personnel ▾, …). */
export function FilterChip({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex h-[23px] items-center gap-1 rounded-[6px] border border-[#333333] bg-[#1c1c1c] px-2.5 text-[10px] font-medium leading-[normal] text-white hover:bg-[#242424]"
    >
      {label}
      <ChevronDown className="size-[9px]" strokeWidth={2.5} aria-hidden />
    </button>
  )
}

/** Underlined sub-heading with a muted count, e.g. "Folders 8". */
export function SubsectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="flex items-baseline gap-2 text-[11px] font-semibold leading-[normal] text-white">
      <span className="underline decoration-solid underline-offset-[3px]">{title}</span>
      <span className="text-[9px] font-normal text-white/50">{count}</span>
    </h3>
  )
}

export function FolderCard({ folder }: { folder: FolderData }) {
  return (
    <article className="relative flex h-[49px] items-center gap-3 rounded-[8px] border border-[#2a2a2a] bg-[#1f1f1f] pl-3 pr-8">
      <button
        type="button"
        className="absolute inset-0 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1f2fb]"
        aria-label={`Open folder ${folder.name}`}
      />
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[6px] bg-[#2c2c2c]">
        <Folder className="size-[12px] fill-white text-white" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] font-semibold leading-[13px] text-white">{folder.name}</span>
        <span className="truncate text-[9px] leading-[13px] text-[#9a9a9a]">
          {folder.playCount} plays · {folder.updated}
        </span>
      </span>
      <button
        type="button"
        className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-[#9a9a9a] hover:text-white"
        aria-label={`More options for ${folder.name}`}
      >
        <EllipsisVertical className="size-[11px]" aria-hidden />
      </button>
    </article>
  )
}

/**
 * Library play card: drawn diagram on top, cream footer with title, time and
 * an optional "Shared" pill. Slightly softer radii than the Recents card,
 * matching the Playbook Library mock.
 */
export function LibraryPlayCard({ play }: { play: LibraryPlayData }) {
  return (
    <article className="relative">
      <button
        type="button"
        className="block w-full overflow-hidden rounded-[8px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1f2fb]"
        aria-label={`Open ${play.title}`}
      >
        <div className="aspect-[225/125] w-full bg-white">
          <PlayDiagram labels={play.labels} variant={play.diagram} />
        </div>
        <div className="flex h-[40px] flex-col justify-center gap-px bg-[#f9f5ec] px-3 text-[#1f1f1f]">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold leading-[13px]">{play.title}</span>
            {play.shared ? (
              <span className="flex h-[12px] shrink-0 items-center gap-0.5 rounded-full bg-[#d6e9fb] px-1.5 text-[7px] font-semibold text-[#2b76ba]">
                <ArrowUpRight className="size-[7px]" strokeWidth={3} aria-hidden />
                Shared
              </span>
            ) : null}
          </span>
          <span className="truncate text-[9px] leading-[12px] text-[#6b6b6b]">{play.meta}</span>
        </div>
      </button>
      <button
        type="button"
        className="absolute right-[6px] top-[7px] flex h-[14px] w-[23px] items-center justify-center rounded-[5px] bg-[#e1f2fb] hover:bg-[#daf2ff] focus-visible:outline-2 focus-visible:outline-[#2b76ba]"
        aria-label={`More options for ${play.title}`}
      >
        <img alt="" src="/chlk/dots.svg" className="block h-[1.907px] w-[9.596px] max-w-none" />
      </button>
    </article>
  )
}
