import type { Metadata } from "next"
import Link from "next/link"

import { AccountViewFilter } from "@/components/crm/account-view-filter"
import { AccountsFilterBar } from "@/components/crm/accounts-filter-bar"
import { Pager } from "@/components/crm/pager"
import { SearchInput } from "@/components/crm/search-input"
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
import {
  ACCOUNTS_PER_PAGE,
  ACCOUNT_SORTS,
  ACCOUNT_VIEWS,
  PROSPECT_MIN_COACHES,
  listAccounts,
} from "@/lib/crm/contacts/accounts"
import { listPlanLabels } from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"
import { parseDirection, parseOffset, parseOneOf } from "@/lib/crm/list"

export const metadata: Metadata = { title: "Accounts · CRM · Chlk" }
export const dynamic = "force-dynamic"

const SUBTITLES = {
  staff: "Programs and schools with a Chlk staff account.",
  prospective: `Schools where ${PROSPECT_MIN_COACHES} or more coaches without a staff account typed the same name into their profile. Click one to see who.`,
}

const EMPTY = {
  staff:
    "No staff accounts yet. They appear here once the Supabase sync links coaches to one, or when you link someone by hand.",
  prospective:
    "No prospects yet: nowhere have two coaches without a staff account typed the same school.",
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    view?: string
    plan?: string
    coaches?: string
    open?: string
    sort?: string
    dir?: string
    offset?: string
  }>
}) {
  const params = await searchParams
  const db = getDb()
  const q = params.q?.trim() || undefined
  const view = parseOneOf(ACCOUNT_VIEWS, params.view)
  const plan = params.plan?.trim() || undefined
  const parsedCoaches = Number(params.coaches)
  const minCoaches =
    Number.isFinite(parsedCoaches) && parsedCoaches > 1
      ? Math.floor(parsedCoaches)
      : undefined
  const hasOpenCase = params.open === "1"
  const sort = parseOneOf(ACCOUNT_SORTS, params.sort)
  const direction = parseDirection(params.dir)
  const offset = parseOffset(params.offset)
  const filtered = Boolean(q || plan || minCoaches || hasOpenCase)

  const { rows, total, limit, viewCounts, view: shown } = await listAccounts(db, {
    q,
    view,
    plan,
    minCoaches,
    hasOpenCase,
    sort,
    direction,
    limit: ACCOUNTS_PER_PAGE,
    offset,
  })
  const plans = listPlanLabels(db)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AccountViewFilter counts={viewCounts} />
        <SearchInput placeholder="Search accounts…" />
      </div>

      <p className="text-muted-foreground text-body">{SUBTITLES[shown]}</p>

      <AccountsFilterBar plans={plans} />

      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="account" />
      </div>

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-body px-4 py-12 text-center">
            {filtered ? "No accounts match these filters." : EMPTY[shown]}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader column="name" defaultDirection="asc">
                    {shown === "prospective" ? "School" : "Account"}
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader column="coaches">Coaches</SortableHeader>
                </TableHead>
                <TableHead>Plans</TableHead>
                <TableHead>
                  <SortableHeader column="activity">Last activity</SortableHeader>
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader column="open" className="justify-end">
                    Open
                  </SortableHeader>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
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
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {row.plans.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        row.plans.map((plan) => (
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
        )}
      </div>
    </div>
  )
}
