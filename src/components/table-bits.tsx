"use client"

import * as React from "react"
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react"

import type { Sort } from "@/lib/sort"
import { cn } from "@/lib/utils"
import { TableHead } from "@/components/ui/table"
import { SampleDataStrip } from "@/components/sample-data"

/**
 * Shared table furniture — the bordered card, sortable headers, the stacked
 * Name/Email cell and the status pill — used by Metrics, Sales and Clinics
 * so every table on the dashboard reads the same. Pair with `@/lib/sort`.
 */
export const HEAD =
  "text-micro text-muted-foreground h-auto px-[18px] py-3 font-medium tracking-[0.05em] uppercase"
export const CELL = "text-label px-[18px] py-3.5 whitespace-normal"

/**
 * Bordered surface around a table, with a "Sample data" strip on top that
 * says what the rows are. Pass `note` to explain; omit it only for tables
 * with no seed rows at all.
 */
export function TableCard({
  note,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { note?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "bg-surface border-surface-border w-full overflow-hidden rounded-xl border",
        className
      )}
      {...props}
    >
      {note && <SampleDataStrip>{note}</SampleDataStrip>}
      {children}
    </div>
  )
}

/** A column header that sorts on click and announces its state. */
export function SortableHead<K extends string>({
  column,
  sort,
  onSort,
  align = "left",
  children,
  className,
}: {
  column: K
  sort: Sort<K> | null
  onSort: (column: K) => void
  align?: "left" | "right"
  children: React.ReactNode
  className?: string
}) {
  const active = sort?.key === column
  const Icon = !active
    ? ChevronsUpDownIcon
    : sort.dir === "asc"
      ? ChevronUpIcon
      : ChevronDownIcon
  return (
    <TableHead
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(HEAD, className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1.5 tracking-[0.05em] uppercase",
          "focus-visible:ring-ring/50 rounded-sm focus-visible:ring-[3px] focus-visible:outline-none",
          // Nova's `.style-nova .cn-table-head` pins text-left with higher
          // specificity than a utility, so right alignment happens here.
          align === "right" && "flex w-full justify-end",
          active && "text-foreground"
        )}
      >
        {children}
        <Icon className="text-faint-foreground size-3" aria-hidden />
      </button>
    </TableHead>
  )
}

/** Name over email, as the mock stacks them. */
export function Who({ name, email }: { name: string; email: string }) {
  return (
    <div>
      <p className="text-label font-semibold tracking-tight">{name}</p>
      <p className="text-caption text-muted-foreground mt-0.5">{email}</p>
    </div>
  )
}

export function Pill({
  tone,
  className,
  ...props
}: React.ComponentProps<"span"> & { tone: "plan" | "annual" | "muted" | "good" }) {
  return (
    <span
      className={cn(
        "text-caption inline-flex h-[22px] items-center rounded-full px-2 font-semibold tracking-tight",
        tone === "plan" && "bg-muted text-foreground",
        tone === "annual" && "bg-secondary-foreground/15 text-foreground dark:bg-secondary-foreground/20",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "good" && "bg-success/10 text-success",
        className
      )}
      {...props}
    />
  )
}
