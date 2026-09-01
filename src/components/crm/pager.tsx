"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Page controls for the list views. The book runs to thousands of
 * customers, so lists are server-paginated and the page lives in the URL —
 * links stay shareable and the back button works.
 */
export function Pager({
  total,
  limit,
  offset,
  noun,
}: {
  total: number
  limit: number
  offset: number
  noun: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (total <= limit) {
    return (
      <p className="text-muted-foreground text-xs">
        {total} {total === 1 ? noun : `${noun}s`}
      </p>
    )
  }

  const first = offset + 1
  const last = Math.min(offset + limit, total)
  const hasPrev = offset > 0
  const hasNext = last < total

  function hrefFor(nextOffset: number) {
    const params = new URLSearchParams(searchParams)
    if (nextOffset > 0) params.set("offset", String(nextOffset))
    else params.delete("offset")
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const buttonClass =
    "inline-flex size-7 items-center justify-center rounded-lg border transition-colors"

  return (
    <div className="flex items-center gap-2">
      <p className="text-muted-foreground text-xs tabular-nums">
        {first}–{last} of {total} {total === 1 ? noun : `${noun}s`}
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(Math.max(0, offset - limit))}
          aria-disabled={!hasPrev}
          tabIndex={hasPrev ? undefined : -1}
          aria-label="Previous page"
          className={cn(
            buttonClass,
            hasPrev
              ? "hover:bg-muted"
              : "text-muted-foreground pointer-events-none opacity-40"
          )}
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
        </Link>
        <Link
          href={hrefFor(offset + limit)}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
          aria-label="Next page"
          className={cn(
            buttonClass,
            hasNext
              ? "hover:bg-muted"
              : "text-muted-foreground pointer-events-none opacity-40"
          )}
        >
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
