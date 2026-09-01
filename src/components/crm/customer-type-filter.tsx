"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

const FILTERS = [
  { value: "", label: "All" },
  { value: "individual", label: "Individuals" },
  { value: "team", label: "Teams" },
]

/** B2C/B2B split — most of the book is individuals, so the default view
 * stays "All" and this narrows rather than hides. */
export function CustomerTypeFilter({
  counts,
}: {
  counts: { all: number; individual: number; team: number }
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get("type") ?? ""

  function hrefFor(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set("type", value)
    else params.delete("type")
    // Switching slice starts again at page one.
    params.delete("offset")
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <nav
      aria-label="Customer type"
      className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5"
    >
      {FILTERS.map((filter) => {
        const active = current === filter.value
        const count =
          filter.value === ""
            ? counts.all
            : filter.value === "individual"
              ? counts.individual
              : counts.team
        return (
          <Link
            key={filter.value}
            href={hrefFor(filter.value)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {filter.label}
            <span className="text-muted-foreground ml-1.5 tabular-nums">
              {count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
