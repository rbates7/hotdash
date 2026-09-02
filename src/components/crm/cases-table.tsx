"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { PriorityBadge, StatusBadge } from "@/components/crm/case-badges"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { SortableHeader } from "@/components/crm/sortable-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CasePriority, CaseStatus } from "@/lib/crm/db/schema"
import { cn } from "@/lib/utils"

/** One row, already formatted by the server: strings only, never Dates,
 * so the client renders exactly what the server did. */
export type CaseTableRow = {
  id: string
  caseNumber: number
  subject: string
  status: CaseStatus
  priority: CasePriority
  contactName: string
  organizationName: string | null
  lastActivity: string
  /** "3d", "5h"; empty for a closed case. */
  age: string
  overdue: boolean
}

async function closeCases(ids: string[]) {
  const response = await fetch("/api/crm/cases/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, status: "closed" }),
  })
  const payload = (await response.json()) as {
    error?: string
    updated?: number
  }
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not close those cases.")
  }
  return payload.updated ?? 0
}

/**
 * The Cases list. Tick rows to close several at once, or close one from
 * its row. Closing is the CRM's "cancel": the case keeps its history and
 * can be reopened from its page — nothing is ever deleted.
 */
export function CasesTable({ rows }: { rows: CaseTableRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [isBusy, setIsBusy] = React.useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false)

  // Selection is per page: only ids on screen count, so a stale tick from
  // an earlier page can never close something you are not looking at.
  const onPage = rows.filter((row) => selected.has(row.id)).map((row) => row.id)
  const selectable = rows.filter((row) => row.status !== "closed")
  const allSelected =
    selectable.length > 0 && selectable.every((row) => selected.has(row.id))
  const someSelected = onPage.length > 0 && !allSelected

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectable.map((row) => row.id)) : new Set())
  }

  async function close(ids: string[]) {
    setIsBusy(true)
    try {
      const updated = await closeCases(ids)
      toast.success(
        updated === 1 ? "Case closed." : `${updated} cases closed.`
      )
      setSelected(new Set())
      setIsConfirmOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not close those cases."
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="rounded-xl border">
      {onPage.length > 0 ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
          <span className="tabular-nums">
            {onPage.length} selected
          </span>
          <Button
            size="sm"
            disabled={isBusy}
            onClick={() => setIsConfirmOpen(true)}
          >
            <CircleCheckIcon />
            Close selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                disabled={selectable.length === 0}
                onCheckedChange={(checked) => toggleAll(checked)}
                aria-label="Select every open case on this page"
              />
            </TableHead>
            <TableHead className="w-16">
              <SortableHeader column="number" defaultDirection="asc">
                #
              </SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="subject" defaultDirection="asc">
                Subject
              </SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="contact" defaultDirection="asc">
                Contact
              </SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="status" defaultDirection="asc">
                Status
              </SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="priority" defaultDirection="asc">
                Priority
              </SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="age">Age</SortableHeader>
            </TableHead>
            <TableHead className="text-right">
              <SortableHeader column="activity" className="justify-end">
                Last activity
              </SortableHeader>
            </TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Close</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const closed = row.status === "closed"
            return (
              <TableRow
                key={row.id}
                data-state={selected.has(row.id) ? "selected" : undefined}
                className={cn(selected.has(row.id) && "bg-muted/40")}
              >
                <TableCell>
                  {closed ? null : (
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(checked) => toggle(row.id, checked)}
                      aria-label={`Select case #${row.caseNumber}`}
                    />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Link href={`/crm/cases/${row.id}`}>#{row.caseNumber}</Link>
                </TableCell>
                <TableCell className="max-w-96">
                  <Link
                    href={`/crm/cases/${row.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {row.subject}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <ContactAvatar name={row.contactName} />
                    <span className="flex flex-col leading-tight">
                      <span>{row.contactName}</span>
                      {row.organizationName ? (
                        <span className="text-muted-foreground text-xs">
                          {row.organizationName}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={row.priority} />
                </TableCell>
                <TableCell
                  className={cn(
                    "tabular-nums",
                    row.overdue
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  )}
                  title={
                    row.overdue
                      ? "Waiting on your reply for over three days"
                      : undefined
                  }
                >
                  {row.age || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  {row.lastActivity}
                </TableCell>
                <TableCell>
                  {closed ? null : (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => close([row.id])}
                      aria-label={`Close case #${row.caseNumber}`}
                      title="Close this case"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <CircleCheckIcon />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Close {onPage.length === 1 ? "this case" : `${onPage.length} cases`}?
            </DialogTitle>
            <DialogDescription>
              Each one moves to Closed with a note saying so. Nothing is
              deleted — reopen any of them from its page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isBusy} onClick={() => close(onPage)}>
              {isBusy ? "Closing…" : "Close cases"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
