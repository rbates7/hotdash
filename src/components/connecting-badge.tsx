import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

/**
 * The connecting state (#50): a read-only key is set and the source's first
 * sync is still running. Muted, busy, and never a figure — the numbers it
 * stands beside stay placeholders. Shared by Home and Settings.
 */
export function ConnectingBadge({
  className,
  testId = "connecting",
}: {
  className?: string
  /** Settings keys its rows by source (`stripe-status`); elsewhere `connecting`. */
  testId?: string
}) {
  return (
    <Badge variant="outline" aria-busy="true" data-testid={testId} className={cn("text-muted-foreground! h-6 px-2.5", className)}>
      {/* Own span, as in NotConnectedBadge: the text inherits the badge colour,
          so the contrast probe's sabotage can still reach it. */}
      <span>Connecting…</span>
    </Badge>
  )
}
