"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { PaperclipIcon, TrashIcon } from "lucide-react"

import {
  contactDisplayName,
  formatCrmDateTime,
  formatCrmRelative,
  timelineFor,
} from "@/lib/crm/crm"
import { isSeedCase, isSeedNote } from "@/lib/crm/fixture"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SampleDataTag } from "@/components/sample-data"
import { PlanBadge } from "@/components/crm/case-badges"
import { CasePrioritySelect } from "@/components/crm/case-priority-select"
import { CaseStatusPath } from "@/components/crm/case-status-path"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { CaseDeleteDialog } from "@/components/crm/crm-delete-dialogs"
import { backToList, useListReturn } from "@/components/crm/crm-return"
import { useCrm } from "@/components/crm/crm-store"
import { CrmSkeleton } from "@/components/crm/crm-skeleton"
import { CRM_44, CRM_ICON_44, CRM_LINK_44, CRM_ROW_44 } from "@/components/crm/crm-touch"
import { EmailBody } from "@/components/crm/email-body"
import { NoteComposer } from "@/components/crm/note-composer"
import * as React from "react"

export function CaseDetail({ caseId }: { caseId: string }) {
  const store = useCrm()
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const caseRow = store.caseById(caseId)
  // The breadcrumb steps back to the list only when this record was opened from it.
  useListReturn("/crm/cases", `/crm/cases/${caseId}`)

  if (!store.persisted) return <CrmSkeleton label="Loading saved case" />

  if (!caseRow) {
    return (
      <div role="status" aria-label="Case not found" className="text-muted-foreground py-16 text-center">
        <p className="text-body text-foreground font-medium">This case is gone</p>
        <p className="text-caption mt-1">
          It is not in this browser’s saved copy.{" "}
          <Link href="/crm/cases" className="underline">
            Back to cases
          </Link>
        </p>
      </div>
    )
  }

  const contact = store.contactById(caseRow.contactId)
  const org = contact ? store.orgById(contact.organizationId) : null
  const contactName = contact ? contactDisplayName(contact) : "Unknown"
  const timeline = timelineFor(caseRow.id, store.messages, store.notes)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">
            <Link
              href="/crm/cases"
              onClick={(event) => backToList(event, "/crm/cases", () => router.back())}
              className={cn("hover:underline", CRM_LINK_44)}
            >
              Cases
            </Link>{" "}
            / #{caseRow.caseNumber}
          </p>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 truncate text-lg font-semibold tracking-tight max-md:whitespace-normal">
            {caseRow.subject}
            {isSeedCase(caseRow.id) ? <SampleDataTag /> : null}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <CasePrioritySelect caseId={caseRow.id} priority={caseRow.priority} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(true)}
            aria-label={`Delete case #${caseRow.caseNumber}`}
            className={CRM_44}
          >
            <TrashIcon aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      <div className="max-w-xl">
        <CaseStatusPath caseId={caseRow.id} status={caseRow.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-3">
          {timeline.map((item) => {
            if (item.kind === "note") {
              const note = item.note
              if (note.kind === "system") {
                return (
                  <div
                    key={`note-${note.id}`}
                    className="text-muted-foreground flex items-center justify-center gap-2 py-0.5 text-xs"
                  >
                    <span className="bg-border h-px w-8" />
                    {note.body} · {formatCrmRelative(note.createdAt, store.nowMs)}
                    <span className="bg-border h-px w-8" />
                  </div>
                )
              }
              return (
                <div
                  key={`note-${note.id}`}
                  className="rounded-lg border border-amber-300 bg-amber-100 px-3.5 py-2.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">
                      Internal note · {formatCrmDateTime(note.createdAt)}
                      {isSeedNote(note.id) ? (
                        <SampleDataTag className="ml-2 align-middle" />
                      ) : null}
                    </p>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Delete note"
                      onClick={() => store.deleteNote(note.id)}
                      className={cn(
                        "text-amber-900 hover:text-red-800 dark:text-amber-200 dark:hover:text-red-200",
                        CRM_ICON_44
                      )}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
                </div>
              )
            }

            const message = item.message
            const inbound = message.direction === "inbound"
            const senderLabel = inbound ? (message.fromName ?? message.fromEmail) : "You"
            return (
              <div
                key={`msg-${message.id}`}
                className={cn(
                  "bg-card rounded-lg border border-l-4",
                  inbound ? "border-l-sky-600" : "border-l-emerald-600"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-2.5">
                  <span className="flex items-center gap-2 text-sm">
                    <CrmAvatar name={senderLabel} />
                    <span className="font-medium">{senderLabel}</span>
                    {!inbound ? <span className="text-muted-foreground text-xs">replied</span> : null}
                  </span>
                  <span
                    className="text-muted-foreground text-xs"
                    title={formatCrmDateTime(message.sentAt)}
                  >
                    {formatCrmRelative(message.sentAt, store.nowMs)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5">
                  <EmailBody html={message.bodyHtml} text={message.bodyText} />
                  {message.attachments.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.attachments.map((attachment, index) => (
                        <span
                          key={index}
                          className="bg-muted text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          title={`${attachment.mimeType} · ${Math.round(attachment.size / 1024)} KB`}
                        >
                          <PaperclipIcon className="size-3" aria-hidden />
                          {attachment.filename}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}

          <div className="bg-card mt-2 rounded-lg border p-3.5">
            <NoteComposer caseId={caseRow.id} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contact</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {contact ? (
                <Link
                  href={`/crm/contacts/${contact.id}`}
                  className={cn("flex items-center gap-2.5 hover:underline", CRM_ROW_44)}
                >
                  <CrmAvatar
                    firstName={contact.firstName}
                    lastName={contact.lastName}
                    email={contact.email}
                    className="size-8"
                  />
                  <span className="flex flex-col leading-tight">
                    <span className="font-medium">{contactName}</span>
                    <span className="text-muted-foreground text-xs">{contact.email}</span>
                  </span>
                </Link>
              ) : (
                <p className="text-muted-foreground">Unknown contact</p>
              )}
              {org ? <p className="text-muted-foreground">{org.name}</p> : null}
              {contact ? <PlanBadge plan={contact.plan} planStatus={contact.planStatus} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground flex flex-col gap-1.5 text-sm">
              <p>Case #{caseRow.caseNumber}</p>
              <p>Opened {formatCrmDateTime(caseRow.createdAt)}</p>
              <p>Last from them: {formatCrmRelative(caseRow.lastInboundAt, store.nowMs)}</p>
              <p>Last from you: {formatCrmRelative(caseRow.lastOutboundAt, store.nowMs)}</p>
              {caseRow.closedAt ? <p>Closed {formatCrmDateTime(caseRow.closedAt)}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <CaseDeleteDialog caseRow={caseRow} open={confirming} onOpenChange={setConfirming} />
    </div>
  )
}
