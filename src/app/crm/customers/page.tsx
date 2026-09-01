import type { Metadata } from "next"
import Link from "next/link"

import { PlanBadge } from "@/components/crm/case-badges"
import { ContactNewDialog } from "@/components/crm/contact-dialogs"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { CustomerTypeFilter } from "@/components/crm/customer-type-filter"
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
  contactDisplayName,
  listContacts,
} from "@/lib/crm/contacts/server"
import { customerType, type CustomerType } from "@/lib/crm/contacts/matching"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"

export const metadata: Metadata = { title: "Customers · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  const { q, type } = await searchParams
  const db = getDb()
  const query = q?.trim() || undefined
  const typeFilter: CustomerType | undefined =
    type === "individual" || type === "team" ? type : undefined

  const rows = await listContacts(db, { q: query, type: typeFilter })
  // Counts ignore the type filter so the chips always show the whole book.
  const all = typeFilter ? await listContacts(db, { q: query }) : rows
  const counts = {
    all: all.length,
    individual: all.filter((r) => customerType(r.contact) === "individual")
      .length,
    team: all.filter((r) => customerType(r.contact) === "team").length,
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CustomerTypeFilter counts={counts} />
        <div className="flex items-center gap-2">
          <SearchInput placeholder="Search customers…" />
          <ContactNewDialog />
        </div>
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
                        {isTeam ? (
                          <span className="text-body">
                            {organization?.name}
                          </span>
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
