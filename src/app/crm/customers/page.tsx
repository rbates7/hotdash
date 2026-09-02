import type { Metadata } from "next"
import Link from "next/link"

import { PlanBadge } from "@/components/crm/case-badges"
import { ContactNewDialog } from "@/components/crm/contact-dialogs"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { CustomerStandingFilter } from "@/components/crm/customer-standing-filter"
import { CustomerTypeFilter } from "@/components/crm/customer-type-filter"
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
  CUSTOMERS_PER_PAGE,
  contactDisplayName,
  listContacts,
  type CustomerStanding,
} from "@/lib/crm/contacts/server"
import { customerType, type CustomerType } from "@/lib/crm/contacts/matching"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"

export const metadata: Metadata = { title: "Customers · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    type?: string
    offset?: string
    standing?: string
  }>
}) {
  const { q, type, standing, offset: offsetParam } = await searchParams
  const db = getDb()
  const query = q?.trim() || undefined
  const typeFilter: CustomerType | undefined =
    type === "individual" || type === "team" ? type : undefined
  // Active is the default; ?standing=all opts out.
  const standingFilter: CustomerStanding = standing === "all" ? "all" : "active"
  const parsedOffset = Number(offsetParam)
  const offset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0

  const { rows, total, counts, standingCounts, limit } = await listContacts(
    db,
    {
      q: query,
      type: typeFilter,
      standing: standingFilter,
      limit: CUSTOMERS_PER_PAGE,
      offset,
    }
  )

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

      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="customer" />
      </div>

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-body px-4 py-12 text-center">
            No customers here yet. Run a Stripe sync from Settings, or add one
            manually.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Last wrote in</TableHead>
                <TableHead className="text-right">Open</TableHead>
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
