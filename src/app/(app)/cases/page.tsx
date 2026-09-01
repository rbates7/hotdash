import type { Metadata } from "next"
import Link from "next/link"

import { PriorityBadge, StatusBadge } from "@/components/cases/case-badges"
import { CasesFilterBar } from "@/components/cases/cases-filter-bar"
import { Avatar } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listCases } from "@/lib/cases/server"
import { contactDisplayName } from "@/lib/contacts/server"
import { getDb } from "@/lib/db/client"
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  type CasePriority,
  type CaseStatus,
} from "@/lib/db/schema"
import { relativeTime } from "@/lib/format"

export const metadata: Metadata = { title: "Cases" }
export const dynamic = "force-dynamic"

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; q?: string }>
}) {
  const params = await searchParams
  const status = CASE_STATUSES.includes(params.status as CaseStatus)
    ? (params.status as CaseStatus)
    : undefined
  const priority = CASE_PRIORITIES.includes(params.priority as CasePriority)
    ? (params.priority as CasePriority)
    : undefined
  const q = params.q?.trim() || undefined

  const rows = await listCases(getDb(), { status, priority, q })

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "case" : "cases"}
            {status || priority || q ? " matching filters" : ""}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <CasesFilterBar />
      </div>
      <div className="mt-4 rounded-xl border">
        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            No cases here. New email from known Chlk users becomes cases
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
                      <Link href={`/cases/${row.id}`}>#{row.caseNumber}</Link>
                    </TableCell>
                    <TableCell className="max-w-96">
                      <Link
                        href={`/cases/${row.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {row.subject}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Avatar name={name} />
                        <span className="flex flex-col leading-tight">
                          <span>{name}</span>
                          {row.contact.organization ? (
                            <span className="text-xs text-muted-foreground">
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
                    <TableCell className="text-right text-muted-foreground">
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
