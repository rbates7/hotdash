import Link from "next/link"

import { PriorityBadge, StatusBadge } from "@/components/crm/case-badges"
import { CasesFilterBar } from "@/components/crm/cases-filter-bar"
import { Pager } from "@/components/crm/pager"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CASES_PER_PAGE, listCases } from "@/lib/crm/cases/server"
import { contactDisplayName } from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  type CasePriority,
  type CaseStatus,
} from "@/lib/crm/db/schema"
import { relativeTime } from "@/lib/crm/format"

export const metadata = { title: "Cases · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    priority?: string
    q?: string
    offset?: string
  }>
}) {
  const params = await searchParams
  const status = CASE_STATUSES.includes(params.status as CaseStatus)
    ? (params.status as CaseStatus)
    : undefined
  const priority = CASE_PRIORITIES.includes(params.priority as CasePriority)
    ? (params.priority as CasePriority)
    : undefined
  const q = params.q?.trim() || undefined

  const parsedOffset = Number(params.offset)
  const offset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0
  const { rows, total, limit } = await listCases(getDb(), {
    status,
    priority,
    q,
    limit: CASES_PER_PAGE,
    offset,
  })

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CasesFilterBar />
      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="case" />
      </div>

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-body px-4 py-12 text-center">
            No cases here. Email from known Chlk users becomes cases
            automatically once Gmail is connected.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const name = contactDisplayName(row.contact)
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">
                      <Link href={`/crm/cases/${row.id}`}>
                        #{row.caseNumber}
                      </Link>
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
                        <ContactAvatar name={name} />
                        <span className="flex flex-col leading-tight">
                          <span>{name}</span>
                          {row.contact.organization ? (
                            <span className="text-muted-foreground text-xs">
                              {row.contact.organization.name}
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
                    <TableCell className="text-muted-foreground text-right">
                      {relativeTime(row.lastActivityAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
