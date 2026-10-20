"use client"

import { PAYING_LABELS, type PayingCoachesView } from "@/lib/paying-coaches"
import { cn } from "@/lib/utils"
import { ConnectingBadge, NotConnectedBadge } from "@/components/home/not-connected"

const PLACEHOLDER_ROWS = (["appStore", "stripe", "invoice"] as const).map((key) => ({ key, label: PAYING_LABELS[key], value: "–" }))

/**
 * Paying coaches: the KPI card's look (`KpiCard`), with the total as the
 * headline and one row per payment method under it. Loading, Connecting…
 * and Not connected keep the rows' room (invisible), so the card never
 * changes height when the counts land. Never a sample number.
 */
export function PayingCoachesCard({ view }: { view: PayingCoachesView }) {
  const loading = view.kind === "loading"
  const notConnected = view.kind === "not_connected"
  const rows = view.kind === "live" ? view.rows : PLACEHOLDER_ROWS
  return (
    <article
      aria-label="Paying coaches"
      aria-busy={loading || undefined}
      data-testid="paying-coaches"
      data-source={view.kind}
      className="bg-surface border-surface-border flex min-h-[124px] flex-col rounded-xl border px-[18px] pt-[18px] pb-4"
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
          view.kind !== "live" && "text-muted-foreground"
        )}
      >
        {view.kind === "live" ? (
          view.total
        ) : (
          <span data-testid="paying-placeholder">
            <span aria-hidden>–</span>
            <span className="sr-only">{loading ? "Loading" : "No figure"}</span>
          </span>
        )}
      </p>
      {view.kind === "live" && view.updated && (
        <p data-testid="paying-updated" className="text-caption text-muted-foreground mt-1.5 tracking-tight">
          {view.updated}
        </p>
      )}
      <dl
        aria-hidden={view.kind !== "live" || undefined}
        data-testid="paying-breakdown"
        className={cn("text-caption mt-2.5 flex flex-col gap-0.5 tracking-tight", view.kind !== "live" && "invisible")}
      >
        {rows.map((row) => (
          <div key={row.key} data-row={row.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground truncate">{row.label}</dt>
            <dd className="text-foreground flex-none font-medium tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

