import type { Metadata } from "next"
import Link from "next/link"

import { PlanBadge } from "@/components/crm/case-badges"
import { ContactNewDialog } from "@/components/crm/contact-dialogs"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { CustomerStandingFilter } from "@/components/crm/customer-standing-filter"
import { CustomerTypeFilter } from "@/components/crm/customer-type-filter"
import { CustomersFilterBar } from "@/components/crm/customers-filter-bar"
import { Pager } from "@/components/crm/pager"
import { PlanDates } from "@/components/crm/plan-dates"
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
  CUSTOMERS_PER_PAGE,
  CUSTOMER_SORTS,
  contactDisplayName,
  listContacts,
  listPlanLabels,
  type CustomerStanding,
} from "@/lib/crm/contacts/server"
import { customerType, type CustomerType } from "@/lib/crm/contacts/matching"
import { CUSTOMER_PLAN_STATUSES } from "@/lib/crm/contacts/plan-status"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"
import {
  parseDirection,
  parseOffset,
  parseOneOf,
  parseWindow,
} from "@/lib/crm/list"

export const metadata: Metadata = { title: "Customers · CRM · Chlk" }
export const dynamic = "force-dynamic"

const CUSTOMER_TYPES = ["individual", "team"] as const satisfies readonly CustomerType[]

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    type?: string
    standing?: string
    plan?: string
    status?: string
    started?: string
    ended?: string
    open?: string
    affiliation?: string
    sort?: string
    dir?: string
    offset?: string
  }>
}) {
  const params = await searchParams
  const db = getDb()
  const query = params.q?.trim() || undefined
  const typeFilter = parseOneOf(CUSTOMER_TYPES, params.type)
  // Active is the default; ?standing=all opts out.
  const standingFilter: CustomerStanding =
    params.standing === "all" ? "all" : "active"
  const plan = params.plan?.trim() || undefined
  const status = parseOneOf(CUSTOMER_PLAN_STATUSES, params.status)
  const started = parseWindow(params.started)
  const ended = parseWindow(params.ended)
  const hasOpenCase = params.open === "1"
  const affiliation = params.affiliation?.trim() || undefined
  const sort = parseOneOf(CUSTOMER_SORTS, params.sort)
  const direction = parseDirection(params.dir)
  const offset = parseOffset(params.offset)
  const filtered = Boolean(
    query || plan || status || started || ended || hasOpenCase || affiliation
  )

  const { rows, total, counts, standingCounts, limit } = await listContacts(
    db,
    {
      q: query,
      type: typeFilter,
      standing: standingFilter,
      plan,
      status,
      started,
      ended,
      hasOpenCase,
      affiliation,
      sort,
      direction,
      limit: CUSTOMERS_PER_PAGE,
      offset,
    }
  )
  const plans = listPlanLabels(db)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CustomerStandingFilter counts={standingCounts} />
          <CustomerTypeFilter counts={counts} />
        </div>
        <div className="flex items-center gap-2">
          <SearchInput placeholder="Search customers…" />
          <ContactNewDialog />
        </div>
      </div>

      <CustomersFilterBar plans={plans} />

      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="customer" />
      </div>

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-body px-4 py-12 text-center">
            {filtered
              ? "No customers match these filters."
              : "No customers here yet. Run a Stripe sync from Settings, or add one manually."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader column="name" defaultDirection="asc">
                    Customer
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader column="account" defaultDirection="asc">
                    Account
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader column="plan" defaultDirection="asc">
                    Plan
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader column="date">Started / Ended</SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader column="lastInbound">
                    Last wrote in
                  </SortableHeader>
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader column="open" className="justify-end">
                    Open
                  </SortableHeader>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(
                ({ contact, organization, openCases, lastInboundAt }) => {
                  const name = contactDisplayName(contact)
                  const isTeam = customerType(contact) === "team"
                  return (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <Link
                          href={`/crm/customers/${contact.id}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <ContactAvatar name={name} />
                          <span className="flex flex-col leading-tight">
                            <span className="font-medium">{name}</span>
                            <span className="text-muted-foreground text-xs">
                              {contact.email}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {isTeam && organization ? (
                          <Link
                            href={`/crm/accounts/${organization.id}`}
                            className="text-body hover:underline"
                          >
                            {organization.name}
                          </Link>
                        ) : (
                          <Badge variant="outline" className="font-normal">
                            Individual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <PlanBadge
                          plan={contact.plan}
                          planStatus={contact.planStatus}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <PlanDates contact={contact} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {relativeTime(lastInboundAt)}
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
                }
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
