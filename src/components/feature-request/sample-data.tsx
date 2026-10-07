import { FlaskConicalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export const SAMPLE_DATA_LABEL = "Sample data"

/**
 * Sits on every invented card. Warning tint on foreground text so it reads
 * in both themes; a single dashed page badge alone is too easy to miss.
 */
export function SampleDataTag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-testid="sample-data-tag"
      className={cn(
        "text-micro border-warning/70 bg-warning/20 text-foreground inline-flex h-5 flex-none items-center gap-1 rounded-full border px-1.5 font-semibold tracking-tight",
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
      className="border-warning/60 bg-warning/15 text-body text-foreground flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5"
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
