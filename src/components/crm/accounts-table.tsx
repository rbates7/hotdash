import Link from "next/link"

import { SortableHeader } from "@/components/crm/sortable-header"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AccountRow } from "@/lib/crm/contacts/accounts"
import { relativeTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"

const KIND_LABELS = {
  staff: "Staff account",
  prospective: "Prospective",
} as const

/** A header row that stays put while the body scrolls under it. The border
 * goes on the cell, not the row: a row's own border does not travel with
 * sticky cells. */
const STUCK = "bg-background sticky top-0 z-10 border-b"

/**
 * The Accounts table, in both places it appears: the paged list at the top
 * of the page, and the complete list of every school below it. One
 * component so the two never drift apart.
 */
export function AccountsTable({
  rows,
  nameLabel,
  empty,
  showKind = false,
  sortParam = "sort",
  dirParam = "dir",
  scroll = false,
}: {
  rows: AccountRow[]
  /** What the first column is called: an Account, or just a School. */
  nameLabel: string
  empty: React.ReactNode
  /** The Type column, for the list where both kinds sit together. */
  showKind?: boolean
  /** Which query keys the sortable headers write. */
  sortParam?: string
  dirParam?: string
  /** Seven rows tall, the rest scrolling in place, header stuck to the top. */
  scroll?: boolean
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-body px-4 py-12 text-center">
        {empty}
      </p>
    )
  }

  const head = (
    column: string,
    label: string,
    options: { alignRight?: boolean; defaultDirection?: "asc" | "desc" } = {}
  ) => (
    <TableHead className={cn(scroll && STUCK, options.alignRight && "text-right")}>
      <SortableHeader
        column={column}
        defaultDirection={options.defaultDirection}
        sortParam={sortParam}
        dirParam={dirParam}
        className={options.alignRight ? "justify-end" : undefined}
      >
        {label}
      </SortableHeader>
    </TableHead>
  )

  return (
    <Table
      // Seven rows and the header: 7 × 41px (py-2.5 on text-sm, plus the
      // row's border) + 37px. A row carrying a domain is taller, so a busy
      // list shows six and a half — which is the point: the half row is
      // what tells you there is more underneath.
      containerClassName={scroll ? "max-h-[324px] overflow-y-auto" : undefined}
    >
      <TableHeader>
        <TableRow>
          {head("name", nameLabel, { defaultDirection: "asc" })}
          {head("coaches", "Coaches")}
          {showKind ? (
            <TableHead className={cn(scroll && STUCK)}>Type</TableHead>
          ) : null}
          <TableHead className={cn(scroll && STUCK)}>Plans</TableHead>
          {head("activity", "Last activity")}
          {head("open", "Open", { alignRight: true })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.kind}:${row.id}`}>
            <TableCell>
              <Link href={row.href} className="font-medium hover:underline">
                {row.name}
              </Link>
              {row.domain ? (
                <span className="text-muted-foreground block text-xs">
                  {row.domain}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {row.staffCount}
            </TableCell>
            {showKind ? (
              <TableCell className="text-muted-foreground">
                {KIND_LABELS[row.kind]}
              </TableCell>
            ) : null}
            <TableCell>
              <span className="flex flex-wrap gap-1">
                {row.plans.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  row.plans.map((plan) => (
                    <Badge key={plan} variant="secondary" className="font-normal">
                      {plan}
                    </Badge>
                  ))
                )}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {relativeTime(row.lastActivityAt)}
            </TableCell>
            <TableCell className="text-right">
              {row.openCases > 0 ? (
                row.openCases
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
