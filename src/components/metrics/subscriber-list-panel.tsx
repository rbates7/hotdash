"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { LockIcon } from "lucide-react"

import { formatDate, formatPeriod, todayIn } from "@/lib/clock"
import { UNLOCK_PATH } from "@/lib/gate/paths"
import { lastUpdatedLabel } from "@/lib/live-metrics"
import { formatCurrency } from "@/lib/metrics"
import {
  planText,
  reasonText,
  whoText,
  type StripeSubscriberRow,
  type SubscriberListKind,
  type SubscriberListState,
} from "@/lib/stripe-subscribers"
import { cn } from "@/lib/utils"
import { useSettings } from "@/hooks/use-settings"
import { useSubscriberList } from "@/hooks/use-stripe-subscribers"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConnectingBadge } from "@/components/connecting-badge"
import { NotConnectedPanel } from "@/components/not-connected-panel"
import { ResponsiveTable, RowCollapse } from "@/components/responsive-table"
import { CELL, TableCard } from "@/components/table-bits"

/* ------------------------------------------------------------------ words */

/** A list that failed with nothing to keep (the poller retries). */
export const LIST_ERROR_TEXT = "Couldn\u2019t load subscribers. Retrying\u2026"

export const LIST_COPY: Record<SubscriberListKind, { title: string; empty: string; hint: string }> = {
  new: {
    title: "New subscribers",
    empty: "No new subscribers in this window",
    hint: "Coaches who paid for the first time in the last 28 days list here once Stripe is connected. Counts are on the Overview tab.",
  },
  churned: {
    title: "Churned subscribers",
    empty: "No churned subscribers in this window",
    hint: "Coaches whose subscription ended in the last 28 days list here once Stripe is connected. Counts are on the Overview tab.",
  },
}

export const STALE_BADGE = "Stale"
export const SESSION_EXPIRED_TEXT = "Your session expired."
export const SIGN_IN_AGAIN = "Sign in again"

/* ------------------------------------------------------------- the states */

/** The amber Stale badge beside "Last updated …": these are the last good rows. */
export function StaleBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" data-testid="stale-badge" className={cn("text-warning-text! border-warning-text/40 h-5 px-2", className)}>
      <span>{STALE_BADGE}</span>
    </Badge>
  )
}

/** The login gate's 401: the rows are there behind the login, never "Not connected". */
function SessionExpired({ title }: { title: string }) {
  const pathname = usePathname()
  const href = `${UNLOCK_PATH}?next=${encodeURIComponent(`${pathname || "/metrics"}${typeof window === "undefined" ? "" : window.location.search}`)}`
  return (
    <section
      aria-label={`${title}: session expired`}
      data-testid="subscriber-list-session-expired"
      className="bg-surface border-surface-border flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center"
    >
      <LockIcon aria-hidden className="text-muted-foreground size-5" />
      <p className="text-label font-semibold tracking-tight">{SESSION_EXPIRED_TEXT}</p>
      <a href={href} className={cn(buttonVariants({ size: "sm" }), "max-xl:min-h-11 max-xl:px-4")}>
        {SIGN_IN_AGAIN}
      </a>
    </section>
  )
}

/**
 * A New or Churned Subscribers tab in each state, around its table:
 * - not_connected   → the shared NotConnectedPanel;
 * - loading         → a table-shaped skeleton; Connecting… during the first sync;
 * - session_expired → Your session expired, with a way to sign in again;
 * - error           → a neutral "Couldn\u2019t load subscribers. Retrying\u2026" line, no figure;
 * - live, no rows   → the empty line, never sample rows;
 * - live            → "N in <window>" and the rows; stale adds "Last updated …" and an amber Stale badge.
 */
export function SubscriberListPanel({
  list,
  state,
  timeZone,
}: {
  list: SubscriberListKind
  state: SubscriberListState
  timeZone: string
}) {
  const copy = LIST_COPY[list]
  if (state.kind === "not_connected") return <NotConnectedPanel title={copy.title} hint={copy.hint} />
  if (state.kind === "session_expired") return <SessionExpired title={copy.title} />
  if (state.kind === "error") {
    return (
      <p role="status" data-testid="subscriber-list-error" className="text-muted-foreground py-6 text-center text-sm">
        {LIST_ERROR_TEXT}
      </p>
    )
  }
  if (state.kind === "loading") {
    return (
      <div
        role="status"
        aria-label={`${copy.title} ${state.connecting ? "connecting" : "loading"}`}
        aria-busy="true"
        data-testid="subscriber-list-loading"
        className="flex flex-col gap-3"
      >
        {state.connecting ? <ConnectingBadge className="self-start" /> : null}
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }
  const window = state.window
    ? formatPeriod({ start: todayIn(new Date(state.window.start), timeZone), end: todayIn(new Date(state.window.end), timeZone) })
    : null
  const shown = state.rows.length
  const count =
    state.total > shown ? `Newest ${shown} of ${state.total.toLocaleString("en-US")}` : `${state.total.toLocaleString("en-US")} in total`
  return (
    <section
      aria-label={copy.title}
      data-testid="subscriber-list"
      data-list={list}
      data-stale={state.stale || undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 tracking-tight">
        <p data-testid="subscriber-list-count">
          {window ? `${window} · ` : ""}
          {count}
        </p>
        {state.stale ? (
          <span className="inline-flex items-center gap-2">
            <StaleBadge />
            <span data-testid="subscriber-list-updated">{lastUpdatedLabel(state.lastSyncedAt, timeZone)}</span>
          </span>
        ) : null}
      </div>
      {shown === 0 ? (
        <p
          data-testid="subscriber-list-empty"
          className="bg-surface border-surface-border text-muted-foreground text-caption rounded-xl border px-4 py-10 text-center"
        >
          {copy.empty}
        </p>
      ) : (
        <SubscriberRowsTable list={list} rows={state.rows} timeZone={timeZone} />
      )}
    </section>
  )
}

/* -------------------------------------------------------------- the table */

function Who({ row }: { row: StripeSubscriberRow }) {
  const who = whoText(row)
  return (
    <div className="min-w-0">
      <p className="text-label font-semibold tracking-tight break-words">{who.title}</p>
      {who.email ? <p className="text-caption text-muted-foreground mt-0.5 break-all">{who.email}</p> : null}
    </div>
  )
}

const money = (v: number | null) => (v === null ? "\u2014" : formatCurrency(v))

/** Newest first, as the route sends them; at most 100. */
export function SubscriberRowsTable({
  list,
  rows,
  timeZone,
}: {
  list: SubscriberListKind
  rows: StripeSubscriberRow[]
  timeZone: string
}) {
  const churned = list === "churned"
  const title = LIST_COPY[list].title
  const date = (row: StripeSubscriberRow) => formatDate(todayIn(new Date(row.at), timeZone))
  const dateLabel = churned ? "Churned" : "Started"
  const mrrLabel = churned ? "MRR lost" : "MRR"
  return (
    <TableCard>
      <ResponsiveTable
        layout="stack"
        stacked={rows.map((row) => {
          const who = whoText(row)
          return (
            <RowCollapse
              key={row.subscriptionId}
              className="[&>svg]:hidden"
              title={who.title}
              status={<span className="text-label font-semibold tabular-nums">{money(row.mrr)}</span>}
              meta={[
                ...(who.email ? [{ label: "Email", value: who.email }] : []),
                { label: "Plan", value: planText(row) },
                { label: dateLabel, value: date(row) },
                ...(churned ? [{ label: "Reason", value: reasonText(row.reason) }] : []),
              ]}
            />
          )
        })}
      >
        <Table aria-label={title}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name / Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>{dateLabel}</TableHead>
              {churned ? <TableHead>Reason</TableHead> : null}
              <TableHead className="text-right">{mrrLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.subscriptionId} className="hover:bg-transparent">
                <TableCell className={CELL}>
                  <Who row={row} />
                </TableCell>
                <TableCell className={CELL}>{planText(row)}</TableCell>
                <TableCell className={CELL}>{date(row)}</TableCell>
                {churned ? <TableCell className={CELL}>{reasonText(row.reason)}</TableCell> : null}
                <TableCell className={`${CELL} text-right font-bold tracking-tight tabular-nums`}>{money(row.mrr)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResponsiveTable>
    </TableCard>
  )
}

/** The tab itself: Hill's route, read while the tab is open. */
export function SubscriberListTab({ list }: { list: SubscriberListKind }) {
  const { timeZone } = useSettings()
  return <SubscriberListPanel list={list} state={useSubscriberList(list)} timeZone={timeZone} />
}
