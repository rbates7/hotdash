import { FlaskConicalIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SampleDataGate } from "@/components/sample-data-gate"

export const SAMPLE_DATA_LABEL = "Sample data"

/**
 * The one sample-data chip for the dashboard (Home's KPI strip and Metrics
 * door, every Metrics card and table, and the screens that follow).
 *
 * Colours for every sample-data surface. Solid fills, no alpha, and the
 * text sits at ≥ 4.5:1 on its own fill in both themes (amber-900 on
 * amber-100 ≈ 8:1; amber-200 on amber-950 ≈ 12:1). The e2e measures each
 * text node, so keep every piece of text inside these classes.
 */
export const SAMPLE_SURFACE =
  "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"

/**
 * Sits on every hard-coded number: KPI cards, metric cards, seed tables.
 * `children` adds a quieter second clause in the same colour, e.g.
 * "· figures are invented, not live" — never a muted tone of its own.
 *
 * Every surface here hides when Settings › Sample data is off. Only the
 * labels go; the figures they sit on stay, since nothing is connected yet.
 *
 * `compact` is the flask alone in the same amber circle, for places with no
 * room for the words (the phone top bar's ticker); the label stays as
 * screen-reader text and a tooltip.
 */
export function SampleDataTag({
  className,
  children,
  compact = false,
  ...props
}: React.ComponentProps<"span"> & { compact?: boolean }) {
  return (
    <SampleDataGate>
      <span
        data-testid="sample-data-tag"
        title={compact ? SAMPLE_DATA_LABEL : undefined}
        className={cn(
          "text-micro inline-flex h-5 flex-none items-center gap-1 rounded-full border px-1.5 font-semibold tracking-tight",
          compact && "w-5 justify-center px-0",
          SAMPLE_SURFACE,
          className
        )}
        {...props}
      >
        <FlaskConicalIcon className="size-3" aria-hidden />
        {compact ? <span className="sr-only">{SAMPLE_DATA_LABEL}</span> : SAMPLE_DATA_LABEL}
        {children && <span className="font-medium">{children}</span>}
      </span>
    </SampleDataGate>
  )
}

/**
 * The page-wide notice above the tabs; says what is and is not real. Pass
 * `children` to replace the body with a screen's own wording; the default
 * is the Metrics copy. `label` replaces the bold lead ("Sample data"), e.g.
 * "Partly live" once some of the page is.
 */
export function SampleDataNotice({ children, label = SAMPLE_DATA_LABEL }: { children?: React.ReactNode; label?: string }) {
  return (
    <SampleDataGate>
      <div
        role="note"
        aria-label={label}
        data-testid="sample-data-notice"
        className={cn(
          "text-body flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
          SAMPLE_SURFACE
        )}
      >
        <FlaskConicalIcon className="mt-0.5 size-4 flex-none" aria-hidden />
        <p>
          <strong className="font-semibold">{label}.</strong>{" "}
          {children ?? (
            <>
              Every number on this page is illustrative. Nothing is connected to Stripe,
              Supabase or PostHog yet — only the cards you add or remove and the expenses
              you enter are yours, and those live in this browser.
            </>
          )}
        </p>
      </div>
    </SampleDataGate>
  )
}

/** The strip above a seed table: the tag plus a line saying what the rows are. */
export function SampleDataStrip({ children }: { children: React.ReactNode }) {
  return (
    <SampleDataGate>
      <div
        data-testid="sample-data-strip"
        className={cn(
          "text-caption flex flex-wrap items-center gap-2 border-b px-[18px] py-2",
          SAMPLE_SURFACE,
          // The strip's own border is the card's divider; the tag keeps its ring.
          "border-x-0 border-t-0"
        )}
      >
        <SampleDataTag />
        <span>{children}</span>
      </div>
    </SampleDataGate>
  )
}
