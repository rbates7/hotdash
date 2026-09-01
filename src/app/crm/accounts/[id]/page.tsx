import type { Metadata } from "next"
import Link from "next/link"

import {
  PlanBadge,
  PriorityBadge,
  StatusBadge,
} from "@/components/crm/case-badges"
import { ContactAvatar } from "@/components/crm/contact-avatar"
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
  getOrganizationWithStaff,
} from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"

export const metadata: Metadata = { title: "Account · CRM · Chlk" }
export const dynamic = "force-dynamic"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3.5 py-3">
      <p className="text-body font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  )
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { organization, staff, cases } = await getOrganizationWithStaff(
    getDb(),
    id
  )
  const openCases = cases.filter((c) => c.caseRow.status !== "closed")

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        <Link href="/crm/accounts" className="hover:underline">
          Accounts
        </Link>{" "}
        / {organization.name}
      </p>

      <div>
        <h2 className="text-title-lg font-semibold">{organization.name}</h2>
        {organization.domain ? (
          <p className="text-muted-foreground text-body">
            {organization.domain}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Coaches on account" value={String(staff.length)} />
        <Stat label="Open cases" value={String(openCases.length)} />
        <Stat label="Cases all time" value={String(cases.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Coaches</h3>
          <div className="divide-y rounded-xl border">
            {staff.map(({ contact, openCases: contactOpen }) => {
              const name = contactDisplayName(contact)
              return (
                <Link
                  key={contact.id}
                  href={`/crm/customers/${contact.id}`}
                  className="hover:bg-muted flex items-center gap-2 px-3 py-2"
                >
                  <ContactAvatar name={name} />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-body truncate font-medium">
                      {name}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {contact.email}
                    </span>
                  </span>
                  <PlanBadge
                    plan={contact.plan}
                    planStatus={contact.planStatus}
                  />
                  {contactOpen > 0 ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {contactOpen}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-body font-semibold">Cases across the account</h3>
          <div className="rounded-xl border">
            {cases.length === 0 ? (
              <p className="text-muted-foreground text-body px-4 py-10 text-center">
                No one on this account has written in yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Coach</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map(({ caseRow, contact }) => (
                    <TableRow key={caseRow.id}>
                      <TableCell className="text-muted-foreground">
                        #{caseRow.caseNumber}
                      </TableCell>
                      <TableCell className="max-w-80">
                        <Link
                          href={`/crm/cases/${caseRow.id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {caseRow.subject}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contactDisplayName(contact)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={caseRow.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={caseRow.priority} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right">
                        {relativeTime(caseRow.lastActivityAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
