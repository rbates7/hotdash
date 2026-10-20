"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { LockIcon } from "lucide-react"

import { now, startOfWeek } from "@/lib/clock"
import { adjustCounts, mergeCases } from "@/lib/crm/local-edits"
import type { CrmAccount, CrmActivity, CrmCase, CrmCounts } from "@/lib/crm/types.ours"
import { agoLabel } from "@/lib/crm/selectors"
import { UNLOCK_PATH } from "@/lib/gate/paths"
import { cn } from "@/lib/utils"
import { useCrmEdits } from "@/hooks/use-crm-edits"
import { useCrmView } from "@/hooks/use-crm-summary"
import { buttonVariants } from "@/components/ui/button"
import { ConnectingBadge } from "@/components/connecting-badge"
import { GMAIL_HINT } from "@/components/crm/gmail-not-connected"
import { NotConnectedBadge } from "@/components/home/not-connected"
import { NotConnectedPanel } from "@/components/not-connected-panel"

/**
 * What every rebuilt CRM screen (Overview, Cases, Accounts) reads: the
 * live summary with this browser's case edits laid over it, and one word
 * for its state so every tile and list handles the same six:
 *
 * - `loading`       — no answer yet: skeletons + Connecting…;
 * - `connecting`    — the server's first Gmail sync runs: the same;
 * - `not_connected` — Not connected panels; counts say Not connected, never 0;
 * - `unauthorized`  — the login gate answered 401: Your session expired;
 * - `live`          — rows (or an honest empty state); `stale` adds Last updated.
 */

export type CrmPhase = "loading" | "connecting" | "not_connected" | "unauthorized" | "live"

export type CrmData = {
  phase: CrmPhase
  stale: boolean
  lastUpdated: string | null
  /** Live rows with this browser's edits applied. */
  cases: CrmCase[]
  /** The rows as the server sent them (the base an edit records). */
  liveCases: CrmCase[]
  accounts: CrmAccount[]
  recentActivity: CrmActivity[]
  counts: CrmCounts | null
  nowMs: number
}

export function useCrmData(): CrmData {
  const view = useCrmView()
  const edits = useCrmEdits()
  const nowMs = useNow()
  return React.useMemo(() => {
    const base = { stale: false, lastUpdated: null, cases: [], liveCases: [], accounts: [], recentActivity: [], counts: null, nowMs }
    if (view.phase === "loading") return { ...base, phase: "loading" }
    if (view.phase === "unauthorized") return { ...base, phase: "unauthorized" }
    const s = view.summary
    if (s.status === "connecting" || s.status === "not_connected") return { ...base, phase: s.status }
    const weekStart = startOfWeek(new Date(nowMs)).getTime()
    return {
      phase: "live",
      stale: s.status === "stale",
      lastUpdated: s.lastUpdated,
      cases: mergeCases(s.cases, edits),
      liveCases: s.cases,
      accounts: s.accounts,
      recentActivity: s.recentActivity,
      counts: s.counts ? adjustCounts(s.counts, s.cases, edits, weekStart) : null,
      nowMs,
    }
  }, [view, edits, nowMs])
}

/** The page's instant, refreshed each minute so "5m ago" keeps moving. */
function useNow() {
  // Rows only render after the browser's first read (the server view is
  // loading), so a server/client minute difference never reaches the DOM.
  const [nowMs, setNowMs] = React.useState(() => now().getTime())
  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(now().getTime()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return nowMs
}

/* ------------------------------------------------------------- the states */

export const SESSION_EXPIRED = "Your session expired."
export const LOG_IN_AGAIN = "Log in again"

/** The login gate's 401: never "Not connected", the data is there behind the login. */
export function CrmSessionExpired({ className }: { className?: string }) {
  const pathname = usePathname()
  const href = `${UNLOCK_PATH}?next=${encodeURIComponent(pathname || "/crm")}`
  return (
    <section
      aria-label="Session expired"
      data-testid="crm-session-expired"
      className={cn(
        "bg-surface border-surface-border flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center",
        className
      )}
    >
      <LockIcon aria-hidden className="text-muted-foreground size-5" />
      <p className="text-label font-semibold tracking-tight">{SESSION_EXPIRED}</p>
      <a href={href} className={cn(buttonVariants({ size: "sm" }), "max-xl:min-h-11 max-xl:px-4")}>
        {LOG_IN_AGAIN}
      </a>
    </section>
  )
}

/** A screen-level panel for the non-live phases, or null when live. */
export function CrmPhasePanel({ data, title }: { data: CrmData; title: string }) {
  if (data.phase === "not_connected") {
    return <NotConnectedPanel title={title} hint={GMAIL_HINT} testId="crm-not-connected" />
  }
  if (data.phase === "unauthorized") return <CrmSessionExpired />
  return null
}

/** Loading / connecting badge, aria-busy, beside a skeleton. */
export function CrmConnecting({ className }: { className?: string }) {
  return <ConnectingBadge className={className} testId="crm-connecting" />
}

export function isWaiting(data: CrmData) {
  return data.phase === "loading" || data.phase === "connecting"
}

/** "Last updated 5m ago" when the rows are the last good copy. */
export function CrmStaleNote({ data, className }: { data: CrmData; className?: string }) {
  if (data.phase !== "live" || !data.stale) return null
  return (
    <p data-testid="crm-stale" className={cn("text-caption text-warning-text tracking-tight", className)}>
      Last updated {agoLabel(data.lastUpdated, data.nowMs)}
    </p>
  )
}

/** A count tile's value: the number, or Not connected / Connecting… — never a 0 that is not real. */
export function CountValue({ data, value }: { data: CrmData; value: number | undefined }) {
  if (data.phase === "not_connected") return <NotConnectedBadge />
  if (data.phase === "unauthorized") return <span className="text-muted-foreground text-label">Log in to see</span>
  if (data.phase !== "live" || value === undefined) return <CrmConnecting />
  return <span className="text-display-sm font-semibold tabular-nums">{value}</span>
}

/** What a screen reader hears when the state changes. */
export function crmAnnouncement(data: CrmData, liveText: string) {
  switch (data.phase) {
    case "loading":
    case "connecting":
      return "Connecting to the support inbox…"
    case "not_connected":
      return "Gmail is not connected."
    case "unauthorized":
      return `${SESSION_EXPIRED} ${LOG_IN_AGAIN}.`
    case "live":
      return data.stale ? `${liveText}. Last updated ${agoLabel(data.lastUpdated, data.nowMs)}.` : liveText
  }
}

/** One polite live region per screen, announcing its state. */
export function CrmLiveRegion({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" data-testid="crm-live-region" className="sr-only">
      {message}
    </p>
  )
}
