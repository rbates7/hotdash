"use client"

import Link from "next/link"
import { ArrowRightIcon, FlameIcon, PenLineIcon } from "lucide-react"

import {
  contactDisplayName,
  countByStatus,
  countTriagePending,
  formatCrmRelative,
  oldestUntouched,
  recentActivity,
  urgentOpenCount,
} from "@/lib/crm/crm"
import { isSeedCase } from "@/lib/crm/fixture"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SampleDataTag } from "@/components/sample-data"
import { StatusBadge } from "@/components/crm/case-badges"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { useCrm } from "@/components/crm/crm-store"
import { CrmSkeleton } from "@/components/crm/crm-skeleton"

function StatCard({
  label,
  value,
  href,
  tone,
}: {
  label: string
  value: number
  href: string
  tone?: "urgent"
}) {
  return (
    <Link href={href} aria-label={`${value} ${label}`}>
      <Card className="hover:bg-muted/40 transition-colors">
        <CardContent className="pt-6">
          <p
            className={
              tone === "urgent" && value > 0
                ? "text-2xl font-semibold tabular-nums text-red-800 dark:text-red-200"
                : "text-2xl font-semibold tabular-nums"
            }
          >
            {value}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{label}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

export function OverviewScreen() {
  const store = useCrm()
  const { cases, contacts, messages, notes, nowMs, persisted } = store

  if (!persisted) return <CrmSkeleton />

  const counts = countByStatus(cases)
  const triageCount = countTriagePending(messages)
  const oldest = oldestUntouched(cases)
  const activity = recentActivity(messages, notes)
  const openConversations = counts.new + counts.open + counts.waiting

  if (cases.length === 0 && contacts.length === 0 && triageCount === 0) {
    return (
      <div
        role="status"
        aria-label="No CRM data"
        className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
      >
        <p className="text-body text-foreground font-medium">CRM is empty</p>
        <p className="text-caption">
          Every sample row has been removed. Add a contact, or Reset to bring the sample data back.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {contacts.length} {contacts.length === 1 ? "contact" : "contacts"} · {openConversations}{" "}
        open conversations
      </p>

      {triageCount > 0 ? (
        <Link
          href="/crm/triage"
          aria-label={`${triageCount} ${
            triageCount === 1 ? "message" : "messages"
          } from unknown senders waiting in triage`}
          className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm"
        >
          <FlameIcon className="size-4" aria-hidden />
          <span>
            <span className="font-medium">{triageCount}</span>{" "}
            {triageCount === 1 ? "message" : "messages"} from unknown senders waiting in triage
          </span>
          <ArrowRightIcon className="text-muted-foreground ml-auto size-4" aria-hidden />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="New" value={counts.new} href="/crm/cases?status=new" />
        <StatCard label="Open" value={counts.open} href="/crm/cases?status=open" />
        <StatCard
          label="Waiting on customer"
          value={counts.waiting}
          href="/crm/cases?status=waiting"
        />
        <StatCard
          label="Urgent, not closed"
          value={urgentOpenCount(cases)}
          href="/crm/cases?priority=urgent"
          tone="urgent"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Oldest untouched</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {oldest.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing waiting on you.</p>
            ) : (
              oldest.map((caseRow) => (
                <Link
                  key={caseRow.id}
                  href={`/crm/cases/${caseRow.id}`}
                  className="hover:bg-muted -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5"
                >
                  <span className="text-muted-foreground text-xs">#{caseRow.caseNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {caseRow.subject}
                  </span>
                  {isSeedCase(caseRow.id) ? <SampleDataTag /> : null}
                  <StatusBadge status={caseRow.status} />
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatCrmRelative(caseRow.lastActivityAt, nowMs)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {activity.length === 0 ? (
              <p className="text-muted-foreground text-sm">No activity yet.</p>
            ) : (
              activity.map((item) => {
                if (item.kind === "note") {
                  const note = item.note
                  const caseRow = cases.find((c) => c.id === note.caseId)
                  return (
                    <Link
                      key={`note-${note.id}`}
                      href={`/crm/cases/${note.caseId}`}
                      className="hover:bg-muted -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        <PenLineIcon className="size-3" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="text-muted-foreground">Note on</span> #{caseRow?.caseNumber}{" "}
                        — {note.body}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatCrmRelative(note.createdAt, nowMs)}
                      </span>
                    </Link>
                  )
                }
                const message = item.message
                const inbound = message.direction === "inbound"
                const caseRow = cases.find((c) => c.id === message.caseId)
                const contact = caseRow ? contacts.find((c) => c.id === caseRow.contactId) : undefined
                const who = inbound
                  ? contact
                    ? contactDisplayName(contact)
                    : (message.fromName ?? message.fromEmail)
                  : "You"
                return (
                  <Link
                    key={`msg-${message.id}`}
                    href={`/crm/cases/${message.caseId}`}
                    className="hover:bg-muted -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5"
                  >
                    <CrmAvatar name={who} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{who}</span>{" "}
                      <span className="text-muted-foreground">
                        {inbound ? "wrote on" : "replied on"} #{caseRow?.caseNumber}
                      </span>{" "}
                      {message.snippet}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatCrmRelative(message.sentAt, nowMs)}
                    </span>
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        Tip: press <kbd className="bg-muted rounded border px-1">⌘K</kbd> to jump to any case or
        contact.
      </p>
    </div>
  )
}
