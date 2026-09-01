import type { Metadata } from "next"
import Link from "next/link"

import { PlanBadge } from "@/components/crm/case-badges"
import { ContactNewDialog } from "@/components/crm/contact-dialogs"
import { SearchInput } from "@/components/crm/search-input"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { contactDisplayName, listContacts } from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"

export const metadata: Metadata = { title: "Contacts · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const rows = await listContacts(getDb(), { q: q?.trim() || undefined })

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-body">
            {rows.length} {rows.length === 1 ? "person" : "people"} — imported
            from Stripe, promoted from triage, or added by hand.
          </p>
        </div>
        <ContactNewDialog />
      </div>
      <div>
        <SearchInput placeholder="Search contacts…" />
      </div>
      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            No contacts yet. Run a Stripe sync from Settings, or add one
            manually.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Open cases</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ contact, organization, openCases }) => {
                const name = contactDisplayName(contact)
                return (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Link
                        href={`/crm/contacts/${contact.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <ContactAvatar name={name} />
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {organization?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <PlanBadge
                        plan={contact.plan}
                        planStatus={contact.planStatus}
                      />
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
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
