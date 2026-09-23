/* eslint-disable @next/next/no-img-element -- thumbnails are fixed mock
   exports that stretch to the card frame exactly as in Figma. */

import type { PlayCardData } from "@/lib/chlk/fixtures"

/**
 * Recents/library card: diagram thumbnail on top, cream footer with title and
 * a secondary line, and a small "more" chip in the top-right corner.
 */
export function PlayCard({ play }: { play: PlayCardData }) {
  return (
    <article className="group relative">
      <button
        type="button"
        className="block w-full rounded-[13px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1f2fb]"
        aria-label={`Open ${play.title}`}
      >
        <div className="aspect-[184.26/116.58] w-full">
          <img
            alt=""
            src={play.thumbnail}
            className="block size-full max-w-none"
          />
        </div>
        <div className="flex h-[38px] flex-col justify-end rounded-b-[13px] border-[0.25px] border-t-0 border-[#858484] bg-[#f9f5ec] px-[9.6px] pb-[7px] text-[#3f3f3f]">
          <p className="truncate text-[11px] font-semibold leading-[13px]">{play.title}</p>
          <p className="truncate text-[9px] font-normal leading-[13px]">{play.meta}</p>
        </div>
      </button>
      <button
        type="button"
        className="absolute right-[7.4px] top-[7px] flex h-[16.78px] w-[16.89px] items-center justify-center rounded-[2px] border-[0.25px] border-[#858484] bg-[#e1f2fb] hover:bg-[#daf2ff] focus-visible:outline-2 focus-visible:outline-[#2b76ba]"
        aria-label={`More options for ${play.title}`}
      >
        <img
          alt=""
          src="/chlk/dots.svg"
          className="block h-[1.907px] w-[9.596px] max-w-none"
        />
      </button>
    </article>
  )
}
