"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { SearchIcon, UsersIcon } from "lucide-react"

import { contactDisplayName, filterContacts, openCaseCount, orgOf } from "@/lib/crm/crm"
import { isSeedContact } from "@/lib/crm/fixture"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CELL, HEAD, TableCard } from "@/components/table-bits"
import { SampleDataTag } from "@/components/sample-data"
import { PlanBadge } from "@/components/crm/case-badges"
import { ContactNewDialog } from "@/components/crm/contact-dialogs"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { useCrm } from "@/components/crm/crm-store"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export function ContactsScreen() {
  const store = useCrm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = React.useState(searchParams.get("q") ?? "")
  const rows = filterContacts(store.contacts, store.organizations, q)

  React.useEffect(() => {
    const current = searchParams.get("q") ?? ""
    if (q === current) return
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (q.trim()) params.set("q", q)
      else params.delete("q")
      const qs = params.toString()
      router.replace(qs ? `/crm/contacts?${qs}` : "/crm/contacts")
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, router, searchParams])

  if (!store.persisted) return <CrmTableSkeleton label="Loading saved contacts" />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-title-sm font-semibold tracking-tight">Contacts</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {q.trim() ? " matching search" : " — sample rows, plus anyone you add"}
          </p>
        </div>
        <ContactNewDialog />
      </div>
      <div className="relative w-56">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search contacts…"
          aria-label="Search contacts"
          className="h-8 pl-8!"
        />
      </div>

      {store.contacts.length === 0 ? (
        <div
          role="status"
          aria-label="No contacts"
          className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
        >
          <UsersIcon className="text-faint-foreground size-6" aria-hidden />
          <p className="text-body text-foreground font-medium">No contacts</p>
          <p className="text-caption">
            Every contact has been removed. Add one, or Reset to bring the sample people back.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p
          role="status"
          aria-label="No matching contacts"
          className="text-muted-foreground px-4 py-12 text-center text-sm"
        >
          No contacts match this search.
        </p>
      ) : (
        <TableCard note="Seed people dated from today. Contacts you add or promote are yours.">
          <Table aria-label="Contacts">
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={HEAD}>Email</TableHead>
                <TableHead className={HEAD}>Organization</TableHead>
                <TableHead className={HEAD}>Plan</TableHead>
                <TableHead className={`${HEAD} text-right`}>Open cases</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((contact) => {
                const org = orgOf(store.organizations, contact.organizationId)
                const name = contactDisplayName(contact)
                return (
                  <TableRow key={contact.id} data-contact={contact.id}>
                    <TableCell className={CELL}>
                      <Link
                        href={`/crm/contacts/${contact.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <CrmAvatar
                          firstName={contact.firstName}
                          lastName={contact.lastName}
                          email={contact.email}
                        />
                        <span className="truncate">{name}</span>
                        {isSeedContact(contact.id) ? <SampleDataTag /> : null}
                      </Link>
                    </TableCell>
                    <TableCell className={`${CELL} text-muted-foreground`}>{contact.email}</TableCell>
                    <TableCell className={`${CELL} text-muted-foreground`}>
                      {org?.name ?? "—"}
                    </TableCell>
                    <TableCell className={CELL}>
                      <PlanBadge plan={contact.plan} planStatus={contact.planStatus} />
                    </TableCell>
                    <TableCell className={`${CELL} text-right`}>
                      {openCaseCount(store.cases, contact.id) || (
                        <span className="text-muted-foreground">0</span>
                      )}
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
