"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { InboxIcon } from "lucide-react"

import {
  contactDisplayName,
  filterCases,
  formatCrmRelative,
  orgOf,
} from "@/lib/crm/crm"
import { isSeedCase } from "@/lib/crm/fixture"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CELL, HEAD, TableCard, Who } from "@/components/table-bits"
import { SampleDataTag } from "@/components/sample-data"
import { PriorityBadge, StatusBadge } from "@/components/crm/case-badges"
import { CasesFilterBar, caseFilterFromSearch } from "@/components/crm/cases-filter-bar"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { useCrm } from "@/components/crm/crm-store"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export function CasesScreen() {
  const store = useCrm()
  const searchParams = useSearchParams()
  const filter = caseFilterFromSearch(searchParams)
  const rows = filterCases(store.cases, store.contacts, store.organizations, filter)
  const filtered = Boolean(filter.status || filter.priority || filter.q)

  if (!store.persisted) return <CrmTableSkeleton label="Loading saved cases" />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="text-title-sm font-semibold tracking-tight">Cases</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {rows.length} {rows.length === 1 ? "case" : "cases"}
          {filtered ? " matching filters" : ""}
        </p>
      </div>
      <CasesFilterBar />
      {store.cases.length === 0 ? (
        <div
          role="status"
          aria-label="No cases"
          className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
        >
          <InboxIcon className="text-faint-foreground size-6" aria-hidden />
          <p className="text-body text-foreground font-medium">No cases</p>
          <p className="text-caption">
            Every case has been removed. Promote a triage thread, or Reset to bring the sample
            cases back.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p
          role="status"
          aria-label="No matching cases"
          className="text-muted-foreground px-4 py-12 text-center text-sm"
        >
          No cases match these filters.
        </p>
      ) : (
        <TableCard note="Seed conversations dated from today. Cases you add or promote are yours.">
          <Table aria-label="Cases">
            <TableHeader>
              <TableRow>
                <TableHead className={`${HEAD} w-16`}>#</TableHead>
                <TableHead className={HEAD}>Subject</TableHead>
                <TableHead className={HEAD}>Contact</TableHead>
                <TableHead className={HEAD}>Status</TableHead>
                <TableHead className={HEAD}>Priority</TableHead>
                <TableHead className={`${HEAD} text-right`}>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const contact = store.contactById(row.contactId)
                const org = contact ? orgOf(store.organizations, contact.organizationId) : null
                const name = contact ? contactDisplayName(contact) : "Unknown"
                return (
                  <TableRow key={row.id} data-case={row.id}>
                    <TableCell className={`${CELL} text-muted-foreground`}>
                      <Link href={`/crm/cases/${row.id}`}>#{row.caseNumber}</Link>
                    </TableCell>
                    <TableCell className={`${CELL} max-w-96`}>
                      <Link
                        href={`/crm/cases/${row.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <span className="truncate">{row.subject}</span>
                        {isSeedCase(row.id) ? <SampleDataTag /> : null}
                      </Link>
                    </TableCell>
                    <TableCell className={CELL}>
                      <span className="flex items-center gap-2">
                        <CrmAvatar
                          firstName={contact?.firstName}
                          lastName={contact?.lastName}
                          email={contact?.email}
                        />
                        <Who name={name} email={org?.name ?? contact?.email ?? ""} />
                      </span>
                    </TableCell>
                    <TableCell className={CELL}>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className={CELL}>
                      <PriorityBadge priority={row.priority} />
                    </TableCell>
                    <TableCell className={`${CELL} text-muted-foreground text-right`}>
                      {formatCrmRelative(row.lastActivityAt, store.nowMs)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  )
}
