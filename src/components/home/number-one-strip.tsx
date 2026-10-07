import Link from "next/link"
import { NotebookPenIcon } from "lucide-react"

import type { NumberOne } from "@/lib/home"

/**
 * The one thing for today, pinned from My Desk. Until My Desk ships this is
 * display data; the pill still points at where it will come from.
 */
export function NumberOneStrip({ item }: { item: NumberOne | null }) {
  return (
    <section
      aria-label="Number one"
      className="bg-surface border-surface-border flex shrink-0 flex-col gap-3 rounded-xl border px-[22px] pt-5 pb-[18px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
          #1
        </span>
        <Link
          href="/my-desk"
          className="border-surface-border bg-surface-hover text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex h-[22px] items-center gap-[5px] rounded-full border pr-2 pl-1.5 text-micro font-medium tracking-tight whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <NotebookPenIcon className="size-3" aria-hidden />
          My Desk
        </Link>
      </div>
      {item ? (
        <div>
          <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">
            {item.title}
          </h2>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            {item.note}
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">
            No #1 yet
          </h2>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            Pick one on My Desk and it shows up here.
          </p>
        </div>
      )}
    </section>
  )
}
