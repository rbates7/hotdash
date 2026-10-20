import { CRASHES_LABEL } from "@/lib/bugs"
import { NotConnectedBadge } from "@/components/home/not-connected"

/**
 * Crashes in the trailing seven Central calendar days. Sentry is the source
 * and it is not connected, so the card says so: an em dash, no delta, never
 * an invented figure. Sentry's crash and error issues are listed below the
 * card (`SentryCrashes`); a weekly crash *count* has no source yet.
 * Same frame and height as before, so the page does not shift when it is.
 */
export function CrashCountCard() {
  return (
    <article
      aria-label={`${CRASHES_LABEL}: not connected`}
      data-source="not_connected"
      className="bg-surface border-surface-border flex min-h-[124px] w-full flex-col rounded-xl border px-[18px] pt-[18px] pb-4 md:max-w-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-label font-semibold tracking-tight">{CRASHES_LABEL}</h2>
        <NotConnectedBadge className="h-5 px-2" />
      </div>
      <p
        data-testid="crash-count"
        className="text-muted-foreground mt-3.5 text-[26px] leading-[1.05] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums"
      >
        <span aria-hidden>{"\u2014"}</span>
        <span className="sr-only">No figure</span>
      </p>
      <p className="text-caption text-muted-foreground mt-1.5 tracking-tight">
        Last 7 days · no figure until Sentry is connected.
      </p>
    </article>
  )
}
