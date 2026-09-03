"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A column header that toggles ordering through the URL, so a sorted view is
 * a link you can bookmark, share, or reload — and so the sort happens in SQL
 * over the whole table rather than over the fifty rows this page happens to
 * hold.
 */
export function SortableHeader({
  column,
  children,
  defaultDirection = "desc",
  sortParam = "sort",
  dirParam = "dir",
  className,
}: {
  column: string
  children: React.ReactNode
  /** Where a first click lands; dates read best newest-first, names A–Z. */
  defaultDirection?: "asc" | "desc"
  /** Which pair of query keys this header owns. A page with two tables on
   * it gives the second its own, so sorting one leaves the other alone. */
  sortParam?: string
  dirParam?: string
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get(sortParam) === column
  const direction = active
    ? ((searchParams.get(dirParam) as "asc" | "desc" | null) ?? defaultDirection)
    : null

  const next = active
    ? direction === "asc"
      ? "desc"
      : "asc"
    : defaultDirection

  const params = new URLSearchParams(searchParams)
  params.set(sortParam, column)
  params.set(dirParam, next)
  // Re-ordering the paged table starts it again at page one. A table with
  // its own keys has no pager, so it leaves the other one where it is.
  if (sortParam === "sort") params.delete("offset")

  const Icon = !active
    ? ChevronsUpDownIcon
    : direction === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon

  return (
    <Link
      href={`${pathname}?${params.toString()}`}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "group inline-flex items-center gap-1 whitespace-nowrap transition-colors",
        active ? "text-foreground" : "hover:text-foreground",
        className
      )}
    >
      {children}
      <Icon
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        )}
      />
    </Link>
  )
}
