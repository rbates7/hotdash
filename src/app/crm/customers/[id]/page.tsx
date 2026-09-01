import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"

import { PlanBadge } from "@/components/crm/case-badges"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { ContactEditDialog } from "@/components/crm/contact-dialogs"
import { CustomerCaseList } from "@/components/crm/customer-case-list"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { contactDisplayName, getContactWithCases } from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
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
  const contact = await getContactWithCases(getDb(), id)
  const name = contactDisplayName(contact)

  const openCases = contact.cases.filter((c) => c.status !== "closed")
  const emailCount = contact.cases.reduce((n, c) => n + c.messages.length, 0)
  const lastInbound = contact.cases
    .flatMap((c) => c.messages.filter((m) => m.direction === "inbound"))
    .reduce<Date | null>(
      (latest, m) => (!latest || m.sentAt > latest ? m.sentAt : latest),
      null
    )

  const hasUsage = Boolean(
    contact.appUserId ||
      contact.signupAt ||
      contact.lastActiveAt ||
      contact.appProfile
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
            <p className="text-muted-foreground text-body">
              {contact.email}
              {contact.organization ? ` · ${contact.organization.name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open cases" value={String(openCases.length)} />
        <Stat label="Cases all time" value={String(contact.cases.length)} />
        <Stat label="Emails exchanged" value={String(emailCount)} />
        <Stat
          label="Last heard from them"
          value={lastInbound ? relativeTime(lastInbound) : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-body font-semibold">Cases and email</h3>
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
                  {contact.lastActiveAt ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Last active</span>
                      <span>{relativeTime(contact.lastActiveAt)}</span>
                    </div>
                  ) : null}
                  {Object.entries(contact.appProfile ?? {}).map(
                    ([key, value]) => (
                      <div key={key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {prettify(key)}
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
