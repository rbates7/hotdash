"use client"

import Link from "next/link"
import { MailIcon } from "lucide-react"

import { caseNumber, initials, personLabel, type CrmCase } from "@/lib/crm/case-view"
import { ageLabel, isOverdue } from "@/lib/crm/selectors"
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
import { CrmStatusBadge } from "@/components/crm/crm-badges"

export type CaseRow = { crmCase: CrmCase; live: CrmCase; accountName: string | null }

export function contactLabel(c: CrmCase) {
  return personLabel(c.contact)
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

export function Avatar({ person, className }: { person: CrmCase["contact"]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-surface-border text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.6rem] font-medium",
        className
      )}
    >
      {initials(person)}
    </span>
  )
}

/** Shown from 1180 up, but not beside an open panel (spec §2). */
const FROM_1180 = "hidden min-[1180px]:table-cell"
/** Shown from 1440 up, but not beside an open panel. */
const FROM_1440 = "hidden min-[1440px]:table-cell"

/**
 * The Cases list, with Deke's column visibility (CRM spec §2):
 *
 * | Column        | <820 | 820 | 1180 | 1440 | 1440 + panel |
 * | #, Subject    | list | ●   | ●    | ●    | ●            |
 * | Contact       | name | name| +acct| +acct| +acct        |
 * | Status        | badge| ●   | ●    | ●    | ●            |
 * | Priority      | —    | —   | ●    | ●    | —            |
 * | Last activity | ●    | ●   | ●    | ●    | —            |
 * | Channel       | —    | —   | —    | icon | —            |
 *
 * Status and priority are pickers in the row, so a case moves without
 * opening it. Below 820 the table is a stacked two-line list (row 1 `#id`
 * + subject, row 2 contact · status · age), never a sideways scroll. No
 * select checkbox (there is no bulk action) and no assignee (Gmail has none).
 * An account-less contact (personal domain) shows "—" for the account.
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
  /** The panel is open beside the list (≥1440). */
  compact?: boolean
  nowMs: number
}) {
  return (
    <>
      <div className="bg-surface border-surface-border overflow-hidden rounded-xl border max-[819px]:hidden">
        <Table aria-label="Cases" className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-6 pr-0">
                <span className="sr-only">Unread</span>
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className={compact ? "w-40" : "w-44 min-[1180px]:w-52"}>Contact</TableHead>
              <TableHead className="w-44">Status</TableHead>
              {compact ? null : <TableHead className={cn(FROM_1180, "w-28")}>Priority</TableHead>}
              {compact ? null : <TableHead className="w-28">Last activity</TableHead>}
              {compact ? null : (
                <TableHead className={cn(FROM_1440, "w-20")}>
                  Channel
                </TableHead>
              )}
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
                  className={cn(open && "bg-surface-selected hover:bg-surface-selected")}
                >
                  <TableCell className="pr-0">
                    <UnreadDot unread={c.unread} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{caseNumber(c.id)}</TableCell>
                  <TableCell className="min-w-0">
                    <Link
                      href={hrefFor(c.id)}
                      scroll={false}
                      data-case-link={c.id}
                      className="block min-w-0 rounded-sm hover:underline max-xl:flex max-xl:min-h-11 max-xl:flex-col max-xl:justify-center"
                    >
                      <span className={cn("block truncate", c.unread ? "font-semibold" : "font-medium")}>{c.subject}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar person={c.contact} />
                      <span className="min-w-0">
                        <span className="block truncate">{contactLabel(c)}</span>
                        <span
                          className={cn("text-muted-foreground truncate text-xs", compact ? "block" : "hidden min-[1180px]:block")}
                          data-testid="case-account"
                        >
                          {accountName ?? "—"}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <CaseStatusSelect crmCase={c} live={live} />
                  </TableCell>
                  {compact ? null : (
                    <TableCell className={FROM_1180}>
                      <CasePrioritySelect crmCase={c} live={live} />
                    </TableCell>
                  )}
                  {compact ? null : (
                    <TableCell>
                      <Age c={c} nowMs={nowMs} />
                    </TableCell>
                  )}
                  {compact ? null : (
                    <TableCell className={FROM_1440}>
                      <MailIcon aria-hidden className="text-muted-foreground size-4" />
                      <span className="sr-only">Gmail</span>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <ul
        aria-label="Cases"
        data-testid="case-list"
        className="bg-surface border-surface-border divide-surface-border flex flex-col divide-y overflow-hidden rounded-xl border min-[820px]:hidden"
      >
        {rows.map(({ crmCase: c }) => {
          const open = c.id === openId
          return (
            <li key={c.id} data-case-id={c.id} data-open={open ? "" : undefined} className={cn(open && "bg-surface-selected")}>
              <Link
                href={hrefFor(c.id)}
                scroll={false}
                data-case-link={c.id}
                aria-current={open ? "true" : undefined}
                className="flex min-h-11 min-w-0 flex-col gap-1 px-3.5 py-2.5"
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{caseNumber(c.id)}</span>
                  <span className={cn("min-w-0 truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.subject}</span>
                  {c.unread ? (
                    <span className="ml-auto self-center">
                      <UnreadDot unread />
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">{contactLabel(c)}</span>
                  <CrmStatusBadge status={c.status} />
                  <Age c={c} nowMs={nowMs} />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
