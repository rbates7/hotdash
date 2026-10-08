"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TrashIcon } from "lucide-react"

import {
  PRIORITY_LABELS,
  contactDisplayName,
  formatCrmDateTime,
  formatCrmRelative,
  type Case,
} from "@/lib/crm/crm"
import { isSeedCase, isSeedContact } from "@/lib/crm/fixture"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CELL, HEAD, TableCard } from "@/components/table-bits"
import { ResponsiveTable, RowCollapse, type RowCollapseMeta } from "@/components/responsive-table"
import { SampleDataTag } from "@/components/sample-data"
import { PlanBadge, PriorityBadge, StatusBadge } from "@/components/crm/case-badges"
import { ContactEditDialog } from "@/components/crm/contact-dialogs"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { ContactDeleteDialog } from "@/components/crm/crm-delete-dialogs"
import { CARD, CARD_LIST } from "@/components/crm/crm-row-actions"
import { backToList, useListReturn } from "@/components/crm/crm-return"
import { useCrm } from "@/components/crm/crm-store"
import { CrmSkeleton } from "@/components/crm/crm-skeleton"
import { CRM_44, CRM_LINK_44, CRM_ROW_44 } from "@/components/crm/crm-touch"

/**
 * A phone card for one of the contact's cases. The contact is the page, so
 * the lines are the case number and "Priority priority · last activity".
 */
export function contactCaseCardMeta(caseRow: Case, nowMs: number): RowCollapseMeta[] {
  return [
    { label: "Case", value: `#${caseRow.caseNumber}` },
    {
      label: "Priority",
      value: `${PRIORITY_LABELS[caseRow.priority]} priority · ${formatCrmRelative(caseRow.lastActivityAt, nowMs)}`,
    },
  ]
}

export function ContactDetail({ contactId }: { contactId: string }) {
  const store = useCrm()
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const contact = store.contactById(contactId)
  // The breadcrumb steps back to the list only when this record was opened from it.
  useListReturn("/crm/contacts", `/crm/contacts/${contactId}`)

  if (!store.persisted) return <CrmSkeleton label="Loading saved contact" />

  if (!contact) {
    return (
      <div role="status" aria-label="Contact not found" className="text-muted-foreground py-16 text-center">
        <p className="text-body text-foreground font-medium">This contact is gone</p>
        <p className="text-caption mt-1">
          <Link href="/crm/contacts" className="underline">
            Back to contacts
          </Link>
        </p>
      </div>
    )
  }

  const name = contactDisplayName(contact)
  const org = store.orgById(contact.organizationId)
  const cases = store.cases
    .filter((c) => c.contactId === contact.id)
    .slice()
    .sort((a, b) => ((a.lastActivityAt ?? a.createdAt) < (b.lastActivityAt ?? b.createdAt) ? 1 : -1))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-muted-foreground text-xs">
        <Link
          href="/crm/contacts"
          onClick={(event) => backToList(event, "/crm/contacts", () => router.back())}
          className={cn("hover:underline", CRM_LINK_44)}
        >
          Contacts
        </Link>{" "}
        / {name}
      </p>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CrmAvatar
            firstName={contact.firstName}
            lastName={contact.lastName}
            email={contact.email}
            className="size-12 text-base"
          />
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              {name}
              {isSeedContact(contact.id) ? <SampleDataTag /> : null}
            </h2>
            <p className="text-muted-foreground text-sm">{contact.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ContactEditDialog contact={contact} organizationName={org?.name ?? null} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${name}`}
            className={CRM_44}
          >
            <TrashIcon aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Organization</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">{org?.name ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanBadge plan={contact.plan} planStatus={contact.planStatus} />
            {!contact.plan ? <span className="text-muted-foreground text-sm">—</span> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Since</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {formatCrmDateTime(contact.createdAt)}
          </CardContent>
        </Card>
      </div>

      <h3 className="text-sm font-semibold">Cases</h3>
      {cases.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border px-4 py-10 text-center text-sm">
          No cases yet for this contact.
        </p>
      ) : (
        <TableCard>
          <ResponsiveTable
            layout="stack"
            className={CARD_LIST}
            stacked={cases.map((caseRow) => (
              <RowCollapse
                key={caseRow.id}
                title={caseRow.subject}
                status={<StatusBadge status={caseRow.status} />}
                meta={contactCaseCardMeta(caseRow, store.nowMs)}
                sample={isSeedCase(caseRow.id)}
                className={CARD}
                onClick={() => router.push(`/crm/cases/${caseRow.id}`)}
              />
            ))}
          >
          <Table aria-label={`Cases for ${name}`}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${HEAD} w-16`}>#</TableHead>
                <TableHead className={HEAD}>Subject</TableHead>
                <TableHead className={HEAD}>Status</TableHead>
                <TableHead className={HEAD}>Priority</TableHead>
                <TableHead className={`${HEAD} text-right`}>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((caseRow) => (
                <TableRow key={caseRow.id}>
                  <TableCell className={`${CELL} text-muted-foreground`}>#{caseRow.caseNumber}</TableCell>
                  <TableCell className={`${CELL} max-w-96`}>
                    <Link
                      href={`/crm/cases/${caseRow.id}`}
                      className={cn("flex items-center gap-2 truncate font-medium hover:underline", CRM_ROW_44)}
                    >
                      {caseRow.subject}
                      {isSeedCase(caseRow.id) ? <SampleDataTag /> : null}
                    </Link>
                  </TableCell>
                  <TableCell className={CELL}>
                    <StatusBadge status={caseRow.status} />
                  </TableCell>
                  <TableCell className={CELL}>
                    <PriorityBadge priority={caseRow.priority} />
                  </TableCell>
                  <TableCell className={`${CELL} text-muted-foreground text-right`}>
                    {formatCrmRelative(caseRow.lastActivityAt, store.nowMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </ResponsiveTable>
        </TableCard>
      )}

      <ContactDeleteDialog
        contactId={contact.id}
        name={name}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </div>
  )
}
