"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * Staff accounts are the default; `?view=prospective` switches to the
 * schools where two or more coaches with no staff account typed the same
 * name — the teams that have not bought the staff plan yet.
 */
export function AccountViewFilter({
  counts,
}: {
  counts: { staff: number; prospective: number }
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const prospective = searchParams.get("view") === "prospective"

  function hrefFor(toProspective: boolean) {
    const params = new URLSearchParams(searchParams)
    if (toProspective) params.set("view", "prospective")
    else params.delete("view")
    // The views sort on the same columns, but page one is a fresh start.
    params.delete("offset")
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const options = [
    { prospective: false, label: "Staff accounts", count: counts.staff },
    { prospective: true, label: "Prospective", count: counts.prospective },
  ]

  return (
    <nav
      aria-label="Account view"
      className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5"
    >
      {options.map((option) => (
        <Link
          key={option.label}
          href={hrefFor(option.prospective)}
          aria-current={prospective === option.prospective ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            prospective === option.prospective
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
