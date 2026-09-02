"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * Active is the default view, not a filter you opt into: most of the book is
 * people who churned or never paid, and burying the paying ones among them
 * makes the list useless at a glance. `?standing=all` opts back out.
 */
export function CustomerStandingFilter({
  counts,
}: {
  counts: { active: number; all: number }
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const showingAll = searchParams.get("standing") === "all"

  function hrefFor(all: boolean) {
    const params = new URLSearchParams(searchParams)
    if (all) params.set("standing", "all")
    else params.delete("standing")
    params.delete("offset")
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const options = [
    { all: false, label: "Active", count: counts.active },
    { all: true, label: "Everyone", count: counts.all },
  ]

  return (
    <nav
      aria-label="Customer standing"
      className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5"
    >
      {options.map((option) => (
        <Link
          key={option.label}
          href={hrefFor(option.all)}
          aria-current={showingAll === option.all ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            showingAll === option.all
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
          <span className="text-muted-foreground ml-1.5 tabular-nums">
            {option.count}
          </span>
        </Link>
      ))}
    </nav>
  )
}
