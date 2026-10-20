"use client"

import { PAYING_LABELS, PAYING_OVERLAP_NOTE, type PayingCoachesView } from "@/lib/paying-coaches"
import { cn } from "@/lib/utils"
import { ConnectingBadge, NotConnectedBadge } from "@/components/home/not-connected"

const PLACEHOLDER_ROWS = (["appStore", "stripe", "invoice"] as const).map((key) => ({ key, label: PAYING_LABELS[key], value: "–" }))

/** The one muted line under the dash when there is no database setting. */
export const PAYING_NOT_CONNECTED_HINT = "Connect the database to see this"

/**
 * Paying coaches: the KPI card's look (`KpiCard`), the total as the headline
 * and one entry per payment method under it.
 *
 * Deke (#67): the methods are label/value rows in a capped-width grid:
 * one column on phones, two from 640px (the card spans the row), one stacked
 * column from 1024px. Figures are tabular. Not
 * connected is only as tall as its content: badge, dash, one muted line.
 * Loading and Connecting… keep the rows' room (invisible) so the card does
 * not jump when counts land. Never a sample number.
 */
export function PayingCoachesCard({ view }: { view: PayingCoachesView }) {
  const loading = view.kind === "loading"
  const notConnected = view.kind === "not_connected"
  const live = view.kind === "live"
  const rows = live ? view.rows : PLACEHOLDER_ROWS
  return (
    <article
      aria-label="Paying coaches"
      aria-busy={loading || undefined}
      data-testid="paying-coaches"
      data-source={view.kind}
      className={cn(
        "bg-surface border-surface-border flex flex-col rounded-xl border px-[18px] pt-[18px] pb-4",
        notConnected ? "self-start" : "min-h-[124px]"
      )}
    >
      <div className="flex min-h-5 items-start justify-between gap-2">
        <p className="text-label font-semibold tracking-tight">Paying coaches</p>
        {notConnected && <NotConnectedBadge className="h-5 px-2" />}
        {view.kind === "loading" && view.connecting && <ConnectingBadge className="h-5 px-2" />}
      </div>
      <p
        data-testid="paying-total"
        className={cn(
          "mt-3.5 text-[26px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums",
          !live && "text-muted-foreground"
        )}
      >
        {live ? (
          view.total
        ) : (
          <span data-testid="paying-placeholder">
            {/* As KpiCard: an em dash when not connected, an en dash while loading. */}
            <span aria-hidden>{loading ? "–" : "\u2014"}</span>
            <span className="sr-only">{loading ? "Loading" : "No figure"}</span>
          </span>
        )}
      </p>
      {notConnected && (
        <p data-testid="paying-hint" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
          {PAYING_NOT_CONNECTED_HINT}
        </p>
      )}
      {live && view.updated && (
        <p data-testid="paying-updated" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
          {view.updated}
        </p>
      )}
      {!notConnected && (
        <>
          <dl
            aria-hidden={!live || undefined}
            data-testid="paying-breakdown"
            className={cn(
              "text-caption mt-2.5 grid w-full max-w-[420px] grid-cols-1 gap-x-6 gap-y-0.5 tracking-tight",
              "sm:grid-cols-2 lg:max-w-none lg:grid-cols-1",
              !live && "invisible"
            )}
          >
            {rows.map((row) => (
              <div key={row.key} data-row={row.key} className="flex min-w-0 items-baseline justify-between gap-3">
                <dt className="text-muted-foreground truncate">{row.label}</dt>
                <dd className="text-foreground flex-none font-medium tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p
            data-testid="paying-overlap-note"
            aria-hidden={!live || undefined}
            className={cn("text-caption text-muted-foreground mt-1 tracking-tight", !live && "invisible")}
          >
            {PAYING_OVERLAP_NOTE}
          </p>
        </>
      )}
    </article>
  )
}
