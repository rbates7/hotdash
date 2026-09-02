import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, FlameIcon } from "lucide-react"

import { StatusBadge } from "@/components/crm/case-badges"
import { ContactAvatar } from "@/components/crm/contact-avatar"
import { PlanDates } from "@/components/crm/plan-dates"
import { ReachedOutCheckbox } from "@/components/crm/reached-out-checkbox"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { OVERDUE_THRESHOLD_DAYS } from "@/lib/crm/cases/age"
import { contactDisplayName } from "@/lib/crm/contacts/server"
import {
  CHURNED_THIS_WEEK_FILTERS,
  getDashboardData,
  NEW_THIS_WEEK_FILTERS,
} from "@/lib/crm/dashboard/server"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"
import { countTriagePending } from "@/lib/crm/triage/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "CRM · Chlk" }
export const dynamic = "force-dynamic"

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
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardContent className="pt-6">
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              tone === "urgent" && value > 0 ? "text-destructive" : ""
            )}
          >
            {value}
          </p>
          <p className="text-muted-foreground text-body">{label}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

function customersUrl(filters: Record<string, string>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    params.set(key === "direction" ? "dir" : key, value)
  }
  return `/crm/customers?${params.toString()}`
}

/** The Overview's new / churned lists: who, when, and whether you have
 * reached out. Cut at OVERVIEW_LIST_LIMIT; "View all" is the same list on
 * the Customers page, filters and all. */
function ContactsCard({
  title,
  empty,
  list,
  href,
}: {
  title: string
  empty: string
  list: {
    rows: {
      contact: {
        id: string
        email: string
        firstName: string | null
        lastName: string | null
        planStatus: string | null
        planStartedAt: Date | null
        planEndedAt: Date | null
        reachedOutAt: Date | null
      }
    }[]
    total: number
  }
  href: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {title}
          {list.total > 0 ? (
            <span className="text-muted-foreground ml-1.5 font-normal tabular-nums">
              {list.total}
            </span>
          ) : null}
        </CardTitle>
        <CardAction className="text-xs text-muted-foreground">
          {list.rows.length > 0 ? "Reached out" : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {list.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          list.rows.map(({ contact }) => {
            const name = contactDisplayName(contact)
            return (
              <div
                key={contact.id}
                className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5"
              >
                <Link
                  href={`/crm/customers/${contact.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 hover:underline"
                >
                  <ContactAvatar name={name} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {contact.email}
                    </span>
                  </span>
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <PlanDates contact={contact} className="text-foreground" />
                </span>
                <ReachedOutCheckbox
                  contactId={contact.id}
                  name={name}
                  reachedOutAt={contact.reachedOutAt?.toISOString() ?? null}
                />
              </div>
            )
          })
        )}
        {list.total > list.rows.length ? (
          <Link
            href={href}
            className="mt-1 inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
          >
            View all ({list.total})
            <ArrowRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  const db = getDb()
  const data = await getDashboardData(db)
  const triageCount = countTriagePending(db)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground text-body">
        {data.contactCount} contacts ·{" "}
        {data.counts.new + data.counts.open + data.counts.waiting} open
        conversations
      </p>

      {triageCount > 0 ? (
        <Link
          href="/crm/triage"
          className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-sm hover:bg-warning/15"
        >
          <FlameIcon className="size-4 text-warning" />
          <span>
            <span className="font-medium">{triageCount}</span>{" "}
            {triageCount === 1 ? "message" : "messages"} from unknown senders
            waiting in triage
          </span>
          <ArrowRightIcon className="ml-auto size-4 text-muted-foreground" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="New" value={data.counts.new} href="/crm/cases?status=new" />
        <StatCard
          label="Open"
          value={data.counts.open}
          href="/crm/cases?status=open"
        />
        <StatCard
          label="Waiting on customer"
          value={data.counts.waiting}
          href="/crm/cases?status=waiting"
        />
        <StatCard
          label="Urgent, not closed"
          value={data.urgentOpen}
          href="/crm/cases?priority=urgent"
          tone="urgent"
        />
        <StatCard
          label={`Waiting on you over ${OVERDUE_THRESHOLD_DAYS} days`}
          value={data.overdueCount}
          href="/crm/cases?overdue=1"
          tone="urgent"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ContactsCard
          title="New this week"
          empty="Nobody started paying in the last 7 days."
          list={data.newThisWeek}
          href={customersUrl(NEW_THIS_WEEK_FILTERS)}
        />
        <ContactsCard
          title="Churned this week"
          empty="Nobody canceled in the last 7 days. 🎉"
          list={data.churnedThisWeek}
          href={customersUrl(CHURNED_THIS_WEEK_FILTERS)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Oldest untouched</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {data.oldestUntouched.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing waiting on you. 🎉
              </p>
            ) : (
              data.oldestUntouched.map((caseRow) => (
                <Link
                  key={caseRow.id}
                  href={`/crm/cases/${caseRow.id}`}
                  className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="text-xs text-muted-foreground">
                    #{caseRow.caseNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {caseRow.subject}
                  </span>
                  <StatusBadge status={caseRow.status} />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(caseRow.lastActivityAt)}
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
            {data.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet — connect Gmail in Settings to start pulling
                conversations in.
              </p>
            ) : (
              data.activity.map((item) => {
                if (item.kind === "note") {
                  const note = item.note
                  return (
                    <Link
                      key={`note-${note.id}`}
                      href={`/crm/cases/${note.caseId}`}
                      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <span className="size-6 shrink-0 rounded-full bg-warning/20 text-center text-xs leading-6 text-warning">
                        ✎
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="text-muted-foreground">Note on</span>{" "}
                        #{note.case!.caseNumber} — {note.body}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(note.createdAt)}
                      </span>
                    </Link>
                  )
                }
                const message = item.message
                const inbound = message.direction === "inbound"
                const who = inbound
                  ? contactDisplayName(message.case!.contact)
                  : "You"
                return (
                  <Link
                    key={`msg-${message.id}`}
                    href={`/crm/cases/${message.caseId}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <ContactAvatar name={who} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{who}</span>{" "}
                      <span className="text-muted-foreground">
                        {inbound ? "wrote on" : "replied on"} #
                        {message.case!.caseNumber}
                      </span>{" "}
                      {message.snippet}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(message.sentAt)}
                    </span>
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        Tip: press <kbd className="rounded border bg-muted px-1">⌘K</kbd> to
        jump to any case or contact.
      </p>
    </div>
  )
}
