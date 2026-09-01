import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, FireIcon } from "@phosphor-icons/react/dist/ssr"

import { StatusBadge } from "@/components/cases/case-badges"
import { Avatar } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { contactDisplayName } from "@/lib/contacts/server"
import { getDashboardData } from "@/lib/dashboard/server"
import { getDb } from "@/lib/db/client"
import { relativeTime } from "@/lib/format"
import { countTriagePending } from "@/lib/triage/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }
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
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function DashboardPage() {
  const db = getDb()
  const data = await getDashboardData(db)
  const triageCount = countTriagePending(db)

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.contactCount} contacts ·{" "}
        {data.counts.new + data.counts.open + data.counts.waiting} open
        conversations
      </p>

      {triageCount > 0 ? (
        <Link
          href="/triage"
          className="mt-4 flex items-center gap-2 rounded-lg border border-chart-4/40 bg-chart-4/10 px-3.5 py-2.5 text-sm hover:bg-chart-4/15"
        >
          <FireIcon className="size-4 text-chart-4" />
          <span>
            <span className="font-medium">{triageCount}</span>{" "}
            {triageCount === 1 ? "message" : "messages"} from unknown senders
            waiting in triage
          </span>
          <ArrowRightIcon className="ml-auto size-4 text-muted-foreground" />
        </Link>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="New" value={data.counts.new} href="/cases?status=new" />
        <StatCard
          label="Open"
          value={data.counts.open}
          href="/cases?status=open"
        />
        <StatCard
          label="Waiting on customer"
          value={data.counts.waiting}
          href="/cases?status=waiting"
        />
        <StatCard
          label="Urgent, not closed"
          value={data.urgentOpen}
          href="/cases?priority=urgent"
          tone="urgent"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
                  href={`/cases/${caseRow.id}`}
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
                      href={`/cases/${note.caseId}`}
                      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <span className="size-6 shrink-0 rounded-full bg-chart-4/20 text-center text-xs leading-6 text-chart-4">
                        ✎
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="text-muted-foreground">Note on</span>{" "}
                        #{note.case.caseNumber} — {note.body}
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
                    href={`/cases/${message.caseId}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <Avatar name={who} />
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

      <p className="mt-8 text-xs text-muted-foreground">
        Tip: press <kbd className="rounded border bg-muted px-1">⌘K</kbd> to
        jump to any case or contact.
      </p>
    </div>
  )
}
