"use client"

import Link from "next/link"
import { MessagesSquareIcon } from "lucide-react"

import { ageLabel, isOverdue } from "@/lib/crm/selectors"
import type { CrmCase } from "@/lib/crm/types.ours"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CasePrioritySelect } from "@/components/crm/case-priority-select"
import { CaseStatusSelect } from "@/components/crm/case-status-select"

export type CaseRow = { crmCase: CrmCase; live: CrmCase; accountName: string | null }

export function contactLabel(c: CrmCase) {
  return c.contact.name ?? c.contact.email
}

function UnreadDot({ unread }: { unread: boolean }) {
  if (!unread) return <span aria-hidden className="inline-block size-2 shrink-0" />
  return (
    <span className="bg-info inline-block size-2 shrink-0 rounded-full" data-testid="unread-dot">
      <span className="sr-only">Unread</span>
    </span>
  )
}

function Age({ c, nowMs }: { c: CrmCase; nowMs: number }) {
  const overdue = isOverdue(c, nowMs)
  return (
    <span
      className={cn("tabular-nums", overdue ? "text-danger-text font-medium" : "text-muted-foreground")}
      title={overdue ? "Waiting on your reply for over three days" : undefined}
    >
      {ageLabel(c.lastMessageAt, nowMs)}
    </span>
  )
}

/**
 * The Cases list, ported from crm-port's table: status and priority are
 * pickers in the row, so a case moves without opening it, and a case opens
 * beside the list (`?case=<id>`). Only columns Gmail can fill: no owner,
 * plan or Stripe standing. With a case open at ≥1280 the table drops to its
 * essentials to make room. Below 768 each row is a stacked card instead,
 * so nothing scrolls sideways.
 */
export function CasesTable({
  rows,
  hrefFor,
  openId,
  compact = false,
  nowMs,
}: {
  rows: CaseRow[]
  hrefFor: (id: string) => string
  openId: string | null
  compact?: boolean
  nowMs: number
}) {
  return (
    <>
      <div className="bg-surface border-surface-border overflow-hidden rounded-xl border max-md:hidden">
        <Table aria-label="Cases">
          <TableHeader>
            <TableRow>
              <TableHead className="w-6">
                <span className="sr-only">Unread</span>
              </TableHead>
              <TableHead>Subject</TableHead>
              {compact ? null : <TableHead className="max-xl:hidden">Account</TableHead>}
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              {compact ? null : <TableHead>Priority</TableHead>}
              <TableHead>Last message</TableHead>
              {compact ? null : <TableHead className="text-right max-lg:hidden">Messages</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ crmCase: c, live, accountName }) => {
              const open = c.id === openId
              return (
                <TableRow
                  key={c.id}
                  data-case-id={c.id}
                  data-open={open ? "" : undefined}
                  aria-current={open ? "true" : undefined}
                  className={cn(open && "bg-primary/10 hover:bg-primary/10")}
                >
                  <TableCell className="pr-0">
                    <UnreadDot unread={c.unread} />
                  </TableCell>
                  <TableCell className={cn("max-w-0 min-w-40", compact ? "w-[45%]" : "w-[38%]")}>
                    <Link
                      href={hrefFor(c.id)}
                      scroll={false}
                      data-case-link={c.id}
                      className="block min-w-0 rounded-sm hover:underline max-xl:flex max-xl:min-h-11 max-xl:flex-col max-xl:justify-center"
                    >
                      <span className={cn("block truncate", c.unread ? "font-semibold" : "font-medium")}>
                        {c.subject}
                      </span>
                      {c.lastMessageSnippet ? (
                        <span className="text-muted-foreground block truncate text-xs">{c.lastMessageSnippet}</span>
                      ) : null}
                    </Link>
                  </TableCell>
                  {compact ? null : (
                    <TableCell className="text-muted-foreground max-w-40 truncate max-xl:hidden">
                      {accountName ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="max-w-48">
                    <span className="block truncate">{contactLabel(c)}</span>
                    {c.contact.name ? (
                      <span className="text-muted-foreground block truncate text-xs">{c.contact.email}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <CaseStatusSelect crmCase={c} live={live} />
                  </TableCell>
                  {compact ? null : (
                    <TableCell>
                      <CasePrioritySelect crmCase={c} live={live} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Age c={c} nowMs={nowMs} />
                  </TableCell>
                  {compact ? null : (
                    <TableCell className="text-muted-foreground text-right tabular-nums max-lg:hidden">
                      {c.messageCount}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Cases" className="flex flex-col gap-2.5 md:hidden" data-testid="case-cards">
        {rows.map(({ crmCase: c, live, accountName }) => (
          <li
            key={c.id}
            data-case-id={c.id}
            data-open={c.id === openId ? "" : undefined}
            className={cn(
              "bg-surface border-surface-border flex min-w-0 flex-col gap-2 rounded-xl border p-3",
              c.id === openId && "border-primary/50"
            )}
          >
            <Link
              href={hrefFor(c.id)}
              scroll={false}
              data-case-link={c.id}
              className="flex min-h-11 min-w-0 items-start gap-2 rounded-sm"
            >
              <span className="mt-1.5">
                <UnreadDot unread={c.unread} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block break-words", c.unread ? "font-semibold" : "font-medium")}>{c.subject}</span>
                {c.lastMessageSnippet ? (
                  <span className="text-muted-foreground line-clamp-2 block text-xs break-words">
                    {c.lastMessageSnippet}
                  </span>
                ) : null}
              </span>
            </Link>
            <p className="text-muted-foreground min-w-0 truncate text-xs">
              {[contactLabel(c), accountName].filter(Boolean).join(" · ")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CaseStatusSelect crmCase={c} live={live} />
              <CasePrioritySelect crmCase={c} live={live} />
              <span className="ml-auto flex items-center gap-2 text-xs">
                <Age c={c} nowMs={nowMs} />
                <span className="text-muted-foreground flex items-center gap-1 tabular-nums">
                  <MessagesSquareIcon aria-hidden className="size-3.5" />
                  {c.messageCount}
                  <span className="sr-only">messages</span>
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
