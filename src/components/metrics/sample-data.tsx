import { FlaskConicalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export const SAMPLE_DATA_LABEL = "Sample data"

/**
 * Colours for every sample-data surface. Solid fills, no alpha, and the
 * text sits at ≥ 4.5:1 on its own fill in both themes (amber-900 on
 * amber-100 ≈ 8:1; amber-200 on amber-950 ≈ 10:1). The e2e measures each
 * text node, so keep every piece of text inside these classes.
 */
export const SAMPLE_SURFACE =
  "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"

/**
 * Sits on every hard-coded number: the metric cards and the seed tables.
 * The tiny dashed page badge alone was too easy to miss.
 */
export function SampleDataTag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-testid="sample-data-tag"
      className={cn(
        "text-micro inline-flex h-5 flex-none items-center gap-1 rounded-full border px-1.5 font-semibold tracking-tight",
        SAMPLE_SURFACE,
        className
      )}
      {...props}
    >
      <FlaskConicalIcon className="size-3" aria-hidden />
      {SAMPLE_DATA_LABEL}
    </span>
  )
}

/** The page-wide notice above the tabs; says what is and is not real. */
export function SampleDataNotice() {
  return (
    <div
      role="note"
      aria-label={SAMPLE_DATA_LABEL}
      data-testid="sample-data-notice"
      className={cn(
        "text-body flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
        SAMPLE_SURFACE
      )}
    >
      <FlaskConicalIcon className="mt-0.5 size-4 flex-none" aria-hidden />
      <p>
        <strong className="font-semibold">{SAMPLE_DATA_LABEL}.</strong> Every number on
        this page is illustrative. Nothing is connected to Stripe, Supabase or PostHog
        yet — only the cards you add or remove and the expenses you enter are yours, and
        those live in this browser.
      </p>
    </div>
  )
}

/** The strip above a seed table: the tag plus a line saying what the rows are. */
export function SampleDataStrip({ children }: { children: React.ReactNode }) {
  return (
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
  )
}
