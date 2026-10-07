import { BugIcon } from "lucide-react"

import { BUG_SOURCE_CONFIG, bugSource } from "@/lib/bugs"
import type { Issue } from "@/lib/issues"
import { cn } from "@/lib/utils"

/**
 * The one "bug" chip. It reads the ticket's labels, so the board card, the
 * ticket view and the Bugs list can never disagree about what is a bug or
 * where it came from. Solid text tokens (≥ 4.5:1 on the surface, both
 * themes): the chip is measured by the Bugs e2e.
 */
export function BugTag({
  issue,
  withSource = false,
  className,
}: {
  issue: Pick<Issue, "labels">
  /** Append the source ("Crash" / "Coach-reported") after the word. */
  withSource?: boolean
  className?: string
}) {
  const source = bugSource(issue)
  return (
    <span
      data-testid="bug-tag"
      data-source={source}
      className={cn(
        "text-micro inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 font-semibold tracking-tight",
        source === "crash" ? "bg-destructive/10 text-danger-text" : "bg-warning/10 text-warning-text",
        className
      )}
    >
      <BugIcon className="size-3" aria-hidden />
      {withSource ? `Bug · ${BUG_SOURCE_CONFIG[source].label}` : "Bug"}
    </span>
  )
}
