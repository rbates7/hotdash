import Link from "next/link"
import { ArrowRightIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A door is a card that opens onto another page. The header is the link;
 * the body is a preview of what is behind it, which may hold links of its
 * own, so the card itself is not an anchor.
 */
export function Door({
  name,
  href,
  icon: Icon,
  count,
  caption,
  children,
  className,
}: {
  name: string
  href: string
  icon: LucideIcon
  /** Small pill under the title, e.g. "2 waiting". */
  count?: string
  /** One-line footer, pinned to the bottom. */
  caption?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={name}
      data-door
      className={cn(
        "bg-surface border-surface-border flex min-h-0 min-w-0 flex-col rounded-xl border px-5 pt-5 pb-[18px] transition-colors",
        "has-[[data-door-link]:hover]:bg-surface-hover",
        className
      )}
    >
      <Link
        href={href}
        data-door-link
        className="group/door focus-visible:ring-ring/50 -mx-2 -mt-2 flex flex-col rounded-lg px-2 pt-2 focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="border-surface-border bg-surface grid size-9 shrink-0 place-items-center rounded-[10px] border"
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="mt-[18px] flex items-center justify-between gap-2.5">
          <span className="text-title-sm leading-[1.2] font-semibold tracking-tight">
            {name}
          </span>
          <span
            aria-hidden
            className="text-muted-foreground group-hover/door:text-foreground grid size-7 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <ArrowRightIcon className="size-4" />
          </span>
        </span>
      </Link>

      {count && (
        <span className="bg-surface-hover text-caption mt-2 inline-flex h-[22px] w-fit items-center rounded-full px-2 font-medium tracking-tight tabular-nums">
          {count}
        </span>
      )}

      {children && <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>}

      {caption && (
        <p className="text-caption text-muted-foreground mt-auto pt-4 leading-[1.4] tracking-tight">
          {caption}
        </p>
      )}
    </section>
  )
}

/** Centered body copy for a door with nothing to preview. */
export function DoorEmpty({
  title,
  hint,
}: {
  title: string
  hint: string
}) {
  return (
    <div className="border-surface-border flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-label font-semibold tracking-tight">{title}</p>
      <p className="text-caption text-muted-foreground mt-1 tracking-tight">{hint}</p>
    </div>
  )
}
