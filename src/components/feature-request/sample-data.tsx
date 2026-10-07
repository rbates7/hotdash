import { FlaskConicalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export const SAMPLE_DATA_LABEL = "Sample data"

/**
 * One palette for every sample-data label, chosen for text contrast rather
 * than tint: amber-800 on amber-100 in light (≈7:1), amber-200 on amber-950
 * in dark (≈12:1). Solid colours, no opacity on the text — the e2e measures
 * each text node against its real background.
 */
export const SAMPLE_PALETTE =
  "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"

/** Sits on every invented card. */
export function SampleDataTag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-testid="sample-data-tag"
      className={cn(
        "text-micro inline-flex h-5 flex-none items-center gap-1 rounded-full border px-1.5 font-semibold tracking-tight",
        SAMPLE_PALETTE,
        className
      )}
      {...props}
    >
      <FlaskConicalIcon className="size-3" aria-hidden />
      {SAMPLE_DATA_LABEL}
    </span>
  )
}

/** The page-wide notice above the board; says what is and is not real. */
export function SampleDataNotice({ count }: { count: number }) {
  return (
    <div
      role="note"
      aria-label={SAMPLE_DATA_LABEL}
      className={cn(
        "text-body flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
        SAMPLE_PALETTE
      )}
    >
      <FlaskConicalIcon className="mt-0.5 size-4 flex-none" aria-hidden />
      <p>
        <strong className="font-semibold">{SAMPLE_DATA_LABEL}.</strong> The{" "}
        {count === 1 ? "card" : `${count} cards`} tagged below{" "}
        {count === 1 ? "is an" : "are"} invented example{count === 1 ? "" : "s"} of
        Dan&rsquo;s ideas, not real requests. Ideas you add or rewrite are yours, and
        they live only in this browser.
      </p>
    </div>
  )
}
