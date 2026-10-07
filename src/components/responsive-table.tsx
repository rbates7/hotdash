import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export const RESPONSIVE_TABLE_SLOT = "responsive-table"

/**
 * The one narrow-screen table helper. Screens should wrap a `Table` (or any
 * wide grid) in this instead of inventing a local scroller.
 *
 * - `scroll` (default): the table keeps its columns and scrolls *inside*
 *   this box. The page itself does not grow sideways.
 * - `stack`: hide the table chrome below `lg` and show `stacked` instead
 *   (cards, definition lists, whatever the screen already has).
 */
export function ResponsiveTable({
  children,
  stacked,
  layout = "scroll",
  className,
  ...props
}: ComponentProps<"div"> & {
  stacked?: React.ReactNode
  layout?: "scroll" | "stack"
}) {
  return (
    <div
      data-slot={RESPONSIVE_TABLE_SLOT}
      data-layout={layout}
      className={cn(
        "w-full min-w-0 max-w-full",
        layout === "scroll" && "overflow-x-auto overscroll-x-contain",
        className
      )}
      {...props}
    >
      {layout === "stack" && stacked ? (
        <>
          <div className="lg:hidden">{stacked}</div>
          <div className="hidden lg:block">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}
