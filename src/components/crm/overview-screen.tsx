"use client"

import Link from "next/link"
import { ArrowRightIcon, FlameIcon, InboxIcon, RefreshCwIcon, ReplyIcon } from "lucide-react"

import { countTriagePending } from "@/lib/crm/crm"
import { agoLabel, ageLabel, isOverdue, oldestWaitingOnUs } from "@/lib/crm/selectors"
import type { CrmActivityKind, CrmCounts } from "@/lib/crm/types.ours"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCrm } from "@/components/crm/crm-store"
import {
  CountValue,
  CrmConnecting,
  CrmLiveRegion,
  CrmSessionExpired,
  CrmStaleNote,
  crmAnnouncement,
  isWaiting,
  useCrmData,
  type CrmData,
} from "@/components/crm/crm-data"
import { GMAIL_HINT } from "@/components/crm/gmail-not-connected"
import { NotConnectedPanel } from "@/components/not-connected-panel"

export const NO_WAITING = "No cases waiting on you"
export const NO_ACTIVITY = "No recent activity"

/** A list row that opens a case: 44 tall below 1280; on a phone the meta wraps under the subject. */
const ROW =
  "hover:bg-muted -mx-2 flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 max-xl:min-h-11 max-md:flex-wrap max-md:gap-y-0.5"

const caseHref = (id: string) => `/crm/cases?case=${encodeURIComponent(id)}`

const COUNT_CARDS: { key: keyof CrmCounts; label: string; href: string; tone?: "urgent" }[] = [
  { key: "open", label: "Open", href: "/crm/cases" },
  { key: "waitingOnUs", label: "Waiting on you", href: "/crm/cases?waiting=1", tone: "urgent" },
  { key: "waitingOnThem", label: "Waiting on them", href: "/crm/cases?status=waiting_on_them" },
  { key: "closedThisWeek", label: "Closed this week", href: "/crm/cases?status=closed" },
]

function CountCard({ data, card }: { data: CrmData; card: (typeof COUNT_CARDS)[number] }) {
  const value = data.counts?.[card.key]
  const body = (
    <Card className={cn("h-full", data.phase === "live" && "hover:bg-muted/40 transition-colors")}>
      <CardContent className="flex flex-col gap-1 pt-6" aria-busy={isWaiting(data) || undefined}>
        <span className={cn(card.tone === "urgent" && value ? "text-danger-text" : undefined)}>
          <CountValue data={data} value={value} />
        </span>
        <span className="text-muted-foreground text-sm">{card.label}</span>
      </CardContent>
    </Card>
  )
  if (data.phase !== "live" || value === undefined) {
    return (
      <div data-testid="crm-count" data-count={card.key}>
        {body}
      </div>
    )
  }
  return (
    <Link
      href={card.href}
      data-testid="crm-count"
      data-count={card.key}
      aria-label={`${value} ${card.label}`}
      className="block rounded-xl max-xl:min-h-11"
    >
      {body}
    </Link>
  )
}

/** A list tile's body for the non-live phases, or null when there are rows to show. */
function TileState({ data, title }: { data: CrmData; title: string }) {
  if (isWaiting(data)) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2.5">
        <CrmConnecting className="self-start" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full rounded-md" />
        ))}
      </div>
    )
  }
  if (data.phase === "not_connected") {
    return <NotConnectedPanel title={title} hint={GMAIL_HINT} testId="crm-not-connected" className="py-6" />
  }
  if (data.phase === "unauthorized") return <CrmSessionExpired className="py-6" />
  return null
}

function OldestWaiting({ data }: { data: CrmData }) {
  const rows = oldestWaitingOnUs(data.cases)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-label">Oldest waiting on you</CardTitle>
      </CardHeader>
      <CardContent>
        <TileState data={data} title="Cases waiting on you" />
        {data.phase === "live" ? (
          rows.length === 0 ? (
            <p className="text-muted-foreground text-caption py-4 text-center">{NO_WAITING}</p>
          ) : (
            <ul aria-label="Oldest waiting on you" className="flex flex-col gap-0.5">
              {rows.map((c) => {
                const overdue = isOverdue(c, data.nowMs)
                return (
                  <li key={c.id}>
                    <Link href={caseHref(c.id)} className={ROW}>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium max-md:basis-full">{c.subject}</span>
                      <span className="text-muted-foreground max-w-40 truncate text-xs">{c.contact.name ?? c.contact.email}</span>
                      <span
                        className={cn("shrink-0 text-xs tabular-nums", overdue ? "text-danger-text font-medium" : "text-muted-foreground")}
                        title={overdue ? "Waiting on your reply for over three days" : undefined}
                      >
                        {ageLabel(c.waitingOnUsSince, data.nowMs)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

const ACTIVITY_ICON: Record<CrmActivityKind, typeof InboxIcon> = {
  received: InboxIcon,
  sent: ReplyIcon,
  status_changed: RefreshCwIcon,
}
const ACTIVITY_LABEL: Record<CrmActivityKind, string> = {
  received: "Received",
  sent: "Sent",
  status_changed: "Status changed",
}

function RecentActivity({ data }: { data: CrmData }) {
  const subjects = new Map(data.cases.map((c) => [c.id, c.subject]))
  const rows = [...data.recentActivity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-label">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <TileState data={data} title="Recent support inbox activity" />
        {data.phase === "live" ? (
          rows.length === 0 ? (
            <p className="text-muted-foreground text-caption py-4 text-center">{NO_ACTIVITY}</p>
          ) : (
            <ul aria-label="Recent activity" className="flex flex-col gap-0.5">
              {rows.map((a) => {
                const Icon = ACTIVITY_ICON[a.kind]
                return (
                  <li key={a.id}>
                    <Link href={caseHref(a.caseId)} className={ROW}>
                      <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full">
                        <Icon aria-hidden className="text-muted-foreground size-3.5" />
                        <span className="sr-only">{ACTIVITY_LABEL[a.kind]}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm max-md:basis-[calc(100%-2.125rem)]">
                        {subjects.has(a.caseId) ? <span className="font-medium">{subjects.get(a.caseId)} · </span> : null}
                        <span className="text-muted-foreground">{a.summary}</span>
                      </span>
                      <time dateTime={a.at} className="text-muted-foreground shrink-0 text-xs max-md:ml-[2.125rem]">
                        {agoLabel(a.at, data.nowMs)}
                      </time>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Unknown senders from develop's triage (the CRM store), as Sept's banner. */
function TriageBanner() {
  const store = useCrm()
  const triageCount = store.gmail.kind === "live" ? countTriagePending(store.messages) : 0
  if (triageCount === 0) return null
  return (
    <Link
      href="/crm/triage"
      aria-label={`${triageCount} ${triageCount === 1 ? "conversation" : "conversations"} from unknown senders waiting in triage`}
      className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm max-xl:min-h-11"
    >
      <FlameIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {triageCount} {triageCount === 1 ? "message" : "messages"} from unknown senders waiting in triage
      </span>
      <ArrowRightIcon aria-hidden className="size-4 shrink-0" />
    </Link>
  )
}

/** Contacts added by hand while Gmail is not connected (develop's own-contacts store). */
function OwnContactsLink() {
  const { contacts, gmail } = useCrm()
  if (gmail.kind !== "not_connected" || contacts.length === 0) return null
  return (
    <p className="text-muted-foreground text-sm">
      <Link
        href="/crm/contacts"
        className="text-foreground font-medium underline-offset-4 hover:underline max-xl:inline-flex max-xl:min-h-11 max-xl:items-center"
      >
        {contacts.length} {contacts.length === 1 ? "contact" : "contacts"} you added
      </Link>{" "}
      in this browser.
    </p>
  )
}

/**
 * Overview (`/crm`), as Sept's: the count cards, the cases that have waited
 * longest on a reply, and what happened most recently — each tile showing
 * its own loading, Not connected, session-expired or empty state.
 */
export function OverviewScreen() {
  const data = useCrmData()
  const c = data.counts
  return (
    <section aria-label="CRM overview" className="flex min-w-0 flex-col gap-4">
      <CrmLiveRegion
        message={crmAnnouncement(
          data,
          c ? `${c.open} open, ${c.waitingOnUs} waiting on you, ${c.waitingOnThem} waiting on them, ${c.closedThisWeek} closed this week` : "Overview"
        )}
      />
      <CrmStaleNote data={data} />
      <TriageBanner />
      <OwnContactsLink />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {COUNT_CARDS.map((card) => (
          <CountCard key={card.key} data={data} card={card} />
        ))}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <OldestWaiting data={data} />
        <RecentActivity data={data} />
      </div>
    </section>
  )
}
