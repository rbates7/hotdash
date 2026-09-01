import type { Metadata } from "next"
import Link from "next/link"

import {
  PlanBadge,
  PriorityBadge,
  StatusBadge,
} from "@/components/cases/case-badges"
import { ContactEditDialog } from "@/components/contacts/contact-dialogs"
import { Avatar } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { contactDisplayName, getContactWithCases } from "@/lib/contacts/server"
import { getDb } from "@/lib/db/client"
import { formatDateTime, relativeTime } from "@/lib/format"

export const metadata: Metadata = { title: "Contact" }
export const dynamic = "force-dynamic"

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const contact = await getContactWithCases(getDb(), id)
  const name = contactDisplayName(contact)

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <p className="text-xs text-muted-foreground">
        <Link href="/contacts" className="hover:underline">
          Contacts
        </Link>{" "}
        / {name}
      </p>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={name} className="size-12 text-base" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">{contact.email}</p>
          </div>
        </div>
        <ContactEditDialog
          contactId={contact.id}
          firstName={contact.firstName}
          lastName={contact.lastName}
          organizationName={contact.organization?.name ?? null}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Organization</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {contact.organization?.name ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanBadge plan={contact.plan} planStatus={contact.planStatus} />
            {!contact.plan ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Since</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {formatDateTime(contact.createdAt)}
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-8 text-sm font-semibold">Cases</h2>
      <div className="mt-3 rounded-xl border">
        {contact.cases.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No cases yet for this contact.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contact.cases.map((caseRow) => (
                <TableRow key={caseRow.id}>
                  <TableCell className="text-muted-foreground">
                    #{caseRow.caseNumber}
                  </TableCell>
                  <TableCell className="max-w-96">
                    <Link
                      href={`/cases/${caseRow.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {caseRow.subject}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={caseRow.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={caseRow.priority} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {relativeTime(caseRow.lastActivityAt)}
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
