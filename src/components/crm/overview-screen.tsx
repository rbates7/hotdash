"use client"

import Link from "next/link"
import { ArrowRightIcon, TriangleAlertIcon } from "lucide-react"

import { activityText, caseNumber, isOpenCrmCase, type CrmCase, type CrmCounts } from "@/lib/crm/case-view"
import { countTriagePending } from "@/lib/crm/crm"
import { agoLabel, ageLabel, isOverdue, oldestWaitingOnUs } from "@/lib/crm/selectors"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CrmStatusBadge } from "@/components/crm/crm-badges"
import { Avatar } from "@/components/crm/cases-table"
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

/** The two tiles the server does not count, worked out from the rows (edits applied). */
type Derived = { urgentOpen: number; overdue: number }
type CountKey = keyof CrmCounts | keyof Derived

/**
 * Deke's stat cards. The server's four counts plus Sept's "Urgent, not
 * closed" and "Waiting on you over 3 days", which read `danger-text` only
 * when above 0 (spec §1).
 */
const COUNT_CARDS: { key: CountKey; label: string; href: string; danger?: true }[] = [
  { key: "open", label: "Open", href: "/crm/cases" },
  { key: "waitingOnUs", label: "Waiting on you", href: "/crm/cases?waiting=1" },
  { key: "waitingOnThem", label: "Waiting on them", href: "/crm/cases?status=waiting_on_them" },
  { key: "urgentOpen", label: "Urgent, not closed", href: "/crm/cases?priority=urgent", danger: true },
  { key: "overdue", label: "Waiting on you over 3 days", href: "/crm/cases?waiting=1", danger: true },
  { key: "closedThisWeek", label: "Closed this week", href: "/crm/cases?status=closed" },
]

function derive(cases: readonly CrmCase[], nowMs: number): Derived {
  return {
    urgentOpen: cases.filter((c) => c.priority === "urgent" && isOpenCrmCase(c)).length,
    overdue: cases.filter((c) => isOverdue(c, nowMs)).length,
  }
}

function CountCard({ data, card, value }: { data: CrmData; card: (typeof COUNT_CARDS)[number]; value: number | undefined }) {
  const body = (
    <Card className={cn("h-full", data.phase === "live" && "hover:bg-muted/40 transition-colors")}>
      <CardContent className="flex flex-col gap-1" aria-busy={isWaiting(data) || undefined}>
        <span className={cn(card.danger && value ? "text-danger-text" : undefined)}>
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
  const rows = oldestWaitingOnUs(data.cases, 6)
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
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{caseNumber(c.id)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium max-md:basis-[calc(100%-2.5rem)]">
                        {c.subject}
                      </span>
                      <CrmStatusBadge status={c.status} className="max-md:ml-8" />
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

function RecentActivity({ data }: { data: CrmData }) {
  const subjects = new Map(data.cases.map((c) => [c.id, c.subject]))
  const rows = [...data.recentActivity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8)
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
              {rows.map((a, i) => {
                const subject = subjects.get(a.caseId)
                return (
                  <li key={`${a.caseId}-${a.at}-${a.type}-${i}`} data-activity-type={a.type}>
                    <Link href={caseHref(a.caseId)} className={ROW}>
                      <Avatar person={a.actor} />
                      <span className="min-w-0 flex-1 truncate text-sm max-md:basis-[calc(100%-2.125rem)]">
                        {activityText(a)}
                        {subject ? <span className="text-muted-foreground"> — {subject}</span> : null}
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

/** Unknown senders from develop's triage (the CRM store): the warning tint plus `warning-text` (spec §1). */
function TriageBanner() {
  const store = useCrm()
  const triageCount = store.gmail.kind === "live" ? countTriagePending(store.messages) : 0
  if (triageCount === 0) return null
  return (
    <Link
      href="/crm/triage"
      aria-label={`${triageCount} ${triageCount === 1 ? "conversation" : "conversations"} from unknown senders waiting in triage`}
      className="border-warning/40 text-warning-text flex items-center gap-2 rounded-lg border bg-[color-mix(in_srgb,var(--warning)_12%,var(--surface))] px-3.5 py-2.5 text-sm hover:brightness-95 max-xl:min-h-11 dark:bg-[color-mix(in_srgb,var(--warning)_18%,var(--surface))] dark:hover:brightness-110"
    >
      <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {triageCount} {triageCount === 1 ? "message" : "messages"} from unknown senders waiting in triage
      </span>
      <span className="flex shrink-0 items-center gap-1 font-medium">
        Review
        <ArrowRightIcon aria-hidden className="size-4" />
      </span>
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
 * Overview (`/crm`), as Deke's frame: a one-line summary, the triage
 * banner, the stat cards, the cases that have waited longest on a reply and
 * what happened most recently — each tile showing its own loading, Not
 * connected, session-expired or empty state. Counts are only numbers when
 * live: the route's zeros while not connected are never shown.
 */
export function OverviewScreen() {
  const data = useCrmData()
  const c = data.counts
  const derived = derive(data.cases, data.nowMs)
  const value = (key: CountKey) => (c === null ? undefined : key in derived ? derived[key as keyof Derived] : c[key as keyof CrmCounts])
  return (
    <section aria-label="CRM overview" className="flex min-w-0 flex-col gap-4">
      <CrmLiveRegion
        message={crmAnnouncement(
          data,
          c ? `${c.open} open, ${c.waitingOnUs} waiting on you, ${c.waitingOnThem} waiting on them, ${c.closedThisWeek} closed this week` : "Overview"
        )}
      />
      {data.phase === "live" && c ? (
        <p className="text-muted-foreground text-sm" data-testid="crm-overview-summary">
          {data.accounts.length} {data.accounts.length === 1 ? "account" : "accounts"} · {c.open} open{" "}
          {c.open === 1 ? "case" : "cases"} · {c.waitingOnThem} waiting on them
        </p>
      ) : null}
      <CrmStaleNote data={data} />
      <TriageBanner />
      <OwnContactsLink />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 min-[1440px]:grid-cols-6">
        {COUNT_CARDS.map((card) => (
          <CountCard key={card.key} data={data} card={card} value={value(card.key)} />
        ))}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <OldestWaiting data={data} />
        <RecentActivity data={data} />
      </div>
    </section>
  )
}
