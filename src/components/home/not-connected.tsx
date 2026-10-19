import { PlugZapIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

/** Honest marker for a Home card with no real data source yet. Never shows numbers. */
export function NotConnectedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" data-testid="not-connected" className={cn("text-muted-foreground! h-6 px-2.5", className)}>
      <PlugZapIcon aria-hidden />
      Not connected
    </Badge>
  )
}

/**
 * #50's connecting state, as Settings shows it ("Connecting…", muted, busy):
 * a key is set and the first sync is still running. The figure stays a
 * placeholder (`data-source="loading"`) — never sample, never Not connected.
 */
export function ConnectingBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" aria-busy data-testid="connecting" className={cn("text-muted-foreground! h-6 px-2.5", className)}>
      Connecting…
    </Badge>
  )
}

/** Door body for a source that is not connected: no sample rows, one line on what will feed it. */
export function DoorNotConnected({ hint }: { hint: string }) {
  return (
    <div
      data-testid="door-not-connected"
      className="border-surface-border flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center"
    >
      <NotConnectedBadge />
      <p className="text-caption text-muted-foreground tracking-tight">{hint}</p>
    </div>
  )
}
