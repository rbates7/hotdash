import { cn } from "@/lib/utils"
import { NotConnectedBadge } from "@/components/home/not-connected"

/**
 * The honest stand-in for a list, table or card whose real source is not
 * connected yet: the Not connected badge, what the panel is, and one line
 * on what will feed it. No rows, no figures, never a fixture in its place.
 * Muted text on the surface clears 4.5:1 in both themes (the same tokens as
 * Home's Not connected doors).
 */
export function NotConnectedPanel({
  title,
  hint,
  className,
  testId = "not-connected-panel",
}: {
  /** What would be here, e.g. "New subscribers". */
  title: string
  /** One line on the source that will feed it. */
  hint: string
  className?: string
  testId?: string
}) {
  return (
    <section
      aria-label={`${title}: not connected`}
      data-testid={testId}
      data-source="not_connected"
      className={cn(
        "bg-surface border-surface-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center",
        className
      )}
    >
      <NotConnectedBadge />
      <p className="text-label font-semibold tracking-tight">{title}</p>
      <p className="text-caption text-muted-foreground max-w-prose tracking-tight">{hint}</p>
    </section>
  )
}
