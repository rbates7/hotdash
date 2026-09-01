import type { Metadata } from "next"
import Link from "next/link"
import {
  ExternalLinkIcon,
  PaperclipIcon,
} from "lucide-react"

import { PlanBadge } from "@/components/crm/case-badges"
import { CasePrioritySelect } from "@/components/crm/case-priority-select"
import { CaseStatusPath } from "@/components/crm/case-status-path"
import { EmailBody } from "@/components/crm/email-body"
import { NoteComposer } from "@/components/crm/note-composer"
import { NoteDeleteButton } from "@/components/crm/note-delete-button"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getCaseWithTimeline } from "@/lib/crm/cases/server"
import { contactDisplayName } from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
import type { EmailMessage, Note } from "@/lib/crm/db/schema"
import {
  formatDateTime,
  gmailThreadUrl,
  relativeTime,
} from "@/lib/crm/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Case · CRM · Chlk" }
export const dynamic = "force-dynamic"

type TimelineItem =
  | { kind: "message"; at: Date; message: EmailMessage }
  | { kind: "note"; at: Date; note: Note }

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const caseRow = await getCaseWithTimeline(getDb(), id)
  const contact = caseRow.contact
  const contactName = contactDisplayName(contact)

  const timeline: TimelineItem[] = [
    ...caseRow.messages.map((message) => ({
      kind: "message" as const,
      at: message.sentAt,
      message,
    })),
    ...caseRow.notes.map((note) => ({
      kind: "note" as const,
      at: note.createdAt,
      note,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            <Link href="/crm/cases" className="hover:underline">
              Cases
            </Link>{" "}
            / #{caseRow.caseNumber}
          </p>
          <h1 className="mt-1 truncate text-title-lg font-semibold">
            {caseRow.subject}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <CasePrioritySelect caseId={caseRow.id} priority={caseRow.priority} />
          {caseRow.gmailThreadId ? (
            <a
              href={gmailThreadUrl(caseRow.gmailThreadId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input px-2.5 text-[0.8rem] font-medium hover:bg-muted"
            >
              <ExternalLinkIcon className="size-3.5" />
              Open in Gmail
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 max-w-xl">
        <CaseStatusPath caseId={caseRow.id} status={caseRow.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-3">
          {timeline.map((item) => {
            if (item.kind === "note") {
              const note = item.note
              if (note.kind === "system") {
                return (
                  <div
                    key={`note-${note.id}`}
                    className="flex items-center justify-center gap-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <span className="h-px w-8 bg-border" />
                    {note.body} · {relativeTime(note.createdAt)}
                    <span className="h-px w-8 bg-border" />
                  </div>
                )
              }
              return (
                <div
                  key={`note-${note.id}`}
                  className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-warning text-xs font-medium">
                      Internal note · {formatDateTime(note.createdAt)}
                    </p>
                    <NoteDeleteButton noteId={note.id} />
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
                </div>
              )
            }

            const message = item.message
            const inbound = message.direction === "inbound"
            const senderLabel = inbound
              ? (message.fromName ?? message.fromEmail)
              : "You"
            return (
              <div
                key={`msg-${message.id}`}
                className={cn(
                  "rounded-lg border border-l-3 bg-card",
                  inbound ? "border-l-info" : "border-l-success bg-success/[0.04]"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-2.5">
                  <span className="flex items-center gap-2 text-sm">
                    <ContactAvatar name={inbound ? senderLabel : "You"} />
                    <span className="font-medium">{senderLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      {inbound ? "" : "replied"}
                    </span>
                  </span>
                  <span
                    className="text-xs text-muted-foreground"
                    title={formatDateTime(message.sentAt)}
                  >
                    {relativeTime(message.sentAt)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5">
                  <EmailBody html={message.bodyHtml} text={message.bodyText} />
                  {message.attachments.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.attachments.map((attachment, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="gap-1 font-normal"
                          title={`${attachment.mimeType} · ${Math.round(attachment.size / 1024)} KB — open in Gmail to download`}
                        >
                          <PaperclipIcon className="size-3" />
                          {attachment.filename}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}

          <div className="mt-2 rounded-lg border bg-card p-3.5">
            <NoteComposer caseId={caseRow.id} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contact</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Link
                href={`/crm/customers/${contact.id}`}
                className="flex items-center gap-2.5 hover:underline"
              >
                <ContactAvatar name={contactName} className="size-8 text-xs" />
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">{contactName}</span>
                  <span className="text-xs text-muted-foreground">
                    {contact.email}
                  </span>
                </span>
              </Link>
              {contact.organization ? (
                <p className="text-muted-foreground">
                  {contact.organization.name}
                </p>
              ) : null}
              <div>
                <PlanBadge
                  plan={contact.plan}
                  planStatus={contact.planStatus}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <p>Case #{caseRow.caseNumber}</p>
              <p>Opened {formatDateTime(caseRow.createdAt)}</p>
              <p>
                Last from them:{" "}
                {caseRow.lastInboundAt
                  ? relativeTime(caseRow.lastInboundAt)
                  : "—"}
              </p>
              <p>
                Last from you:{" "}
                {caseRow.lastOutboundAt
                  ? relativeTime(caseRow.lastOutboundAt)
                  : "—"}
              </p>
              {caseRow.closedAt ? (
                <p>Closed {formatDateTime(caseRow.closedAt)}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
