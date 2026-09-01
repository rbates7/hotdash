import type { Metadata } from "next"
import Link from "next/link"

import { Pager } from "@/components/crm/pager"
import { SearchInput } from "@/components/crm/search-input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ACCOUNTS_PER_PAGE,
  listOrganizations,
} from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"

export const metadata: Metadata = { title: "Accounts · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>
}) {
  const { q, offset: offsetParam } = await searchParams
  const parsed = Number(offsetParam)
  const offset = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0

  const { rows, total, limit } = await listOrganizations(getDb(), {
    q: q?.trim() || undefined,
    limit: ACCOUNTS_PER_PAGE,
    offset,
  })

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-body">
          Programs and schools with more than one coach on the account.
        </p>
        <SearchInput placeholder="Search accounts…" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="account" />
      </div>

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-body px-4 py-12 text-center">
            No accounts yet. Organizations appear here once customers are
            linked to one, via Supabase enrichment or a manual edit.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Coaches</TableHead>
                <TableHead>Plans</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(
                ({
                  organization,
                  staffCount,
                  plans,
                  openCases,
                  lastActivityAt,
                }) => (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <Link
                        href={`/crm/accounts/${organization.id}`}
                        className="font-medium hover:underline"
                      >
                        {organization.name}
                      </Link>
                      {organization.domain ? (
                        <span className="text-muted-foreground block text-xs">
                          {organization.domain}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {staffCount}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {plans.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          plans.map((plan) => (
                            <Badge
                              key={plan}
                              variant="secondary"
                              className="font-normal"
                            >
                              {plan}
                            </Badge>
                          ))
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {relativeTime(lastActivityAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {openCases > 0 ? (
                        openCases
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
