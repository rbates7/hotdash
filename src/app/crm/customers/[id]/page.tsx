import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLinkIcon } from "lucide-react"

import { PlanBadge } from "@/components/crm/case-badges"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { ContactEditDialog } from "@/components/crm/contact-dialogs"
import { ContactNoteComposer } from "@/components/crm/contact-note-composer"
import { ContactTimeline } from "@/components/crm/contact-timeline"
import { CustomerCaseList } from "@/components/crm/customer-case-list"
import { ReachedOutCheckbox } from "@/components/crm/reached-out-checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  contactDisplayName,
  getContactWithCases,
  listTeammates,
} from "@/lib/crm/contacts/server"
import { customerType } from "@/lib/crm/contacts/matching"
import { NotFoundError } from "@/lib/crm/core/errors"
import { getDb } from "@/lib/crm/db/client"
import { chlkMapping } from "@/lib/crm/supabase/mapping"
import { formatDateTime, relativeTime } from "@/lib/crm/format"

export const metadata: Metadata = { title: "Customer · CRM · Chlk" }
export const dynamic = "force-dynamic"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3.5 py-3">
      <p className="text-body font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  )
}

function prettify(key: string) {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = getDb()
  const contact = await getContactWithCases(db, id).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const name = contactDisplayName(contact)
  const isTeam = customerType(contact) === "team"
  // B2B customers are worked as an account, so show who else is on it.
  const teammates =
    isTeam && contact.organizationId
      ? listTeammates(db, contact.organizationId, contact.id)
      : []

  // Open means the ball is with you; waiting on the customer is not open.
  const openCases = contact.cases.filter(
    (c) => c.status === "new" || c.status === "open"
  )
  const emailCount =
    contact.cases.reduce((n, c) => n + c.messages.length, 0) +
    contact.sentOutsideCases.length
  const latest = (dates: (Date | null)[]) =>
    dates.reduce<Date | null>(
      (best, d) => (d && (!best || d > best) ? d : best),
      null
    )
  const lastInbound = latest(
    contact.cases
      .flatMap((c) => c.messages.filter((m) => m.direction === "inbound"))
      .map((m) => m.sentAt)
  )
  // When you last contacted them: an email you sent (on a case or not), a
  // call you logged, or the reached-out tick.
  const lastContacted = latest([
    ...contact.cases
      .flatMap((c) => c.messages.filter((m) => m.direction === "outbound"))
      .map((m) => m.sentAt),
    ...contact.sentOutsideCases.map((m) => m.sentAt),
    ...contact.notes.filter((n) => n.kind === "call").map((n) => n.createdAt),
    contact.reachedOutAt,
  ])

  const hasUsage = Boolean(
    contact.appUserId || contact.signupAt || contact.appProfile
  )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        <Link href="/crm/customers" className="hover:underline">
          Customers
        </Link>{" "}
        / {name}
      </p>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ContactAvatar name={name} className="size-12 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-title-lg font-semibold">{name}</h2>
              <PlanBadge plan={contact.plan} planStatus={contact.planStatus} />
            </div>
            <p className="text-muted-foreground text-body flex flex-wrap items-center gap-1.5">
              {contact.email}
              {isTeam && contact.organization ? (
                <>
                  ·{" "}
                  <Link
                    href={`/crm/accounts/${contact.organization.id}`}
                    className="hover:underline"
                  >
                    {contact.organization.name}
                  </Link>
                </>
              ) : (
                <Badge variant="outline" className="font-normal">
                  Individual
                </Badge>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-caption text-muted-foreground mr-1 flex items-center gap-1.5">
            <ReachedOutCheckbox
              contactId={contact.id}
              name={name}
              reachedOutAt={contact.reachedOutAt?.toISOString() ?? null}
            />
            Reached out
          </label>
          <a
            href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(contact.email)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-input hover:bg-muted text-caption inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-medium"
          >
            <ExternalLinkIcon className="size-3.5" aria-hidden />
            Their email in Gmail
          </a>
          <ContactEditDialog
            contactId={contact.id}
            firstName={contact.firstName}
            lastName={contact.lastName}
            organizationName={contact.organization?.name ?? null}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Open cases" value={String(openCases.length)} />
        <Stat label="Cases all time" value={String(contact.cases.length)} />
        <Stat label="Emails exchanged" value={String(emailCount)} />
        <Stat
          label="Last heard from them"
          value={lastInbound ? relativeTime(lastInbound) : "—"}
        />
        <Stat
          label="Last contacted by you"
          value={lastContacted ? relativeTime(lastContacted) : "never"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-body font-semibold">Notes and calls</h3>
          <ContactNoteComposer contactId={contact.id} />
          <ContactTimeline notes={contact.notes} />

          {contact.sentOutsideCases.length > 0 ? (
            <>
              <h3 className="text-body mt-4 font-semibold">
                Emails you started
              </h3>
              <p className="text-muted-foreground -mt-1 text-xs">
                Sent from your inbox with no reply yet, so no case.
              </p>
              <ul className="flex flex-col gap-1.5">
                {contact.sentOutsideCases.map((message) => (
                  <li
                    key={message.id}
                    className="bg-card flex items-center gap-3 rounded-xl border px-3.5 py-2.5"
                  >
                    <ContactAvatar name="You" />
                    <span className="min-w-0 flex-1">
                      <span className="text-body block truncate font-medium">
                        {message.subject ?? "(no subject)"}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {message.snippet}
                      </span>
                    </span>
                    <span
                      className="text-muted-foreground shrink-0 text-xs"
                      title={formatDateTime(message.sentAt)}
                    >
                      {relativeTime(message.sentAt)}
                    </span>
                    <a
                      href={`https://mail.google.com/mail/u/0/#all/${message.gmailThreadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Open in Gmail"
                    >
                      <ExternalLinkIcon className="size-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3 className="text-body mt-4 font-semibold">Cases and email</h3>
          <CustomerCaseList
            customerName={name}
            cases={contact.cases.map((c) => ({
              id: c.id,
              caseNumber: c.caseNumber,
              subject: c.subject,
              status: c.status,
              priority: c.priority,
              lastActivityAt: c.lastActivityAt,
              messages: c.messages.map((m) => ({
                id: m.id,
                direction: m.direction,
                fromName: m.fromName,
                fromEmail: m.fromEmail,
                snippet: m.snippet,
                bodyText: m.bodyText,
                sentAt: m.sentAt,
                attachmentCount: m.attachments.length,
              })),
            }))}
          />
        </div>

        <div className="flex flex-col gap-4">
          {isTeam ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-caption">
                  <Link
                    href={`/crm/accounts/${contact.organizationId}`}
                    className="hover:underline"
                  >
                    Others on {contact.organization?.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {teammates.length === 0 ? (
                  <p className="text-muted-foreground text-caption">
                    No one else from this account is in the CRM yet.
                  </p>
                ) : (
                  teammates.map(({ contact: mate, openCases }) => {
                    const mateName = contactDisplayName(mate)
                    return (
                      <Link
                        key={mate.id}
                        href={`/crm/customers/${mate.id}`}
                        className="hover:bg-muted -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1"
                      >
                        <ContactAvatar name={mateName} />
                        <span className="text-body min-w-0 flex-1 truncate">
                          {mateName}
                        </span>
                        {openCases > 0 ? (
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {openCases} open
                          </span>
                        ) : null}
                      </Link>
                    )
                  })
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-caption">Product usage</CardTitle>
            </CardHeader>
            <CardContent className="text-body flex flex-col gap-2">
              {hasUsage ? (
                <>
                  {contact.appUserId ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Chlk user</span>
                      <span className="font-mono text-xs">
                        {contact.appUserId}
                      </span>
                    </div>
                  ) : null}
                  {contact.signupAt ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Signed up</span>
                      <span>{formatDateTime(contact.signupAt)}</span>
                    </div>
                  ) : null}
                  {Object.entries(contact.appProfile ?? {}).map(
                    ([key, value]) => (
                      <div key={key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {chlkMapping.extraLabels[key] ?? prettify(key)}
                        </span>
                        <span className="truncate">{String(value)}</span>
                      </div>
                    )
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-caption">
                  No product data yet.{" "}
                  <Link
                    href="/crm/settings"
                    className="underline underline-offset-4"
                  >
                    Connect Supabase
                  </Link>{" "}
                  to pull signup date, last activity and team details from the
                  Chlk app.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-caption">Billing</CardTitle>
            </CardHeader>
            <CardContent className="text-body flex flex-col gap-2">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Plan</span>
                <span>{contact.plan ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <span>{contact.planStatus ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {contact.planStartedAt && contact.planStartedAt > new Date()
                    ? "Starts paying"
                    : "Started paying"}
                </span>
                <span>
                  {contact.planStartedAt
                    ? formatDateTime(contact.planStartedAt)
                    : "—"}
                </span>
              </div>
              {contact.planEndedAt ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Ended</span>
                  <span>{formatDateTime(contact.planEndedAt)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">In CRM since</span>
                <span>{formatDateTime(contact.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
