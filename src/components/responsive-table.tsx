import type { ComponentProps } from "react"
import { ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SampleDataTag } from "@/components/sample-data"
import { Skeleton } from "@/components/ui/skeleton"

export const RESPONSIVE_TABLE_SLOT = "responsive-table"
export const ROW_COLLAPSE_SLOT = "row-collapse"

/**
 * The one narrow-screen table helper. Screens should wrap a `Table` (or any
 * wide grid) in this instead of inventing a local scroller.
 *
 * Deke 7:46 / 7:47:
 * - `stack`: phone (<768) shows `stacked` cards (`RowCollapse`); `md+` keeps
 *   the table. Tablet tables should pass ≤5 columns and fold extras into the
 *   first cell's subline at the screen.
 * - `scroll` (default): keep columns and scroll inside this box. Use
 *   `pinFirst` for dense numeric tables (Metrics Expenses).
 */
export function ResponsiveTable({
  children,
  stacked,
  layout = "scroll",
  pinFirst = false,
  className,
  ...props
}: ComponentProps<"div"> & {
  stacked?: React.ReactNode
  layout?: "scroll" | "stack"
  pinFirst?: boolean
}) {
  return (
    <div
      data-slot={RESPONSIVE_TABLE_SLOT}
      data-layout={layout}
      data-pin-first={pinFirst || undefined}
      className={cn(
        "w-full min-w-0 max-w-full",
        layout === "scroll" && "overflow-x-auto overscroll-x-contain",
        pinFirst &&
          "[&_th:first-child]:bg-background [&_td:first-child]:bg-background [&_th:first-child]:sticky [&_td:first-child]:sticky [&_th:first-child]:left-0 [&_td:first-child]:left-0 [&_th:first-child]:z-10 [&_td:first-child]:z-10",
        className
      )}
      {...props}
    >
      {layout === "stack" && stacked ? (
        <>
          <div className="md:hidden">{stacked}</div>
          <div className="hidden md:block">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}

/**
 * Phone record-list card (Deke 7:46). Title + status pill + two meta lines +
 * chevron. Whole row is the tap target (min 64). `onClick` should open the
 * screen's existing row dialog as a bottom sheet — wiring is per-screen.
 */
export function RowCollapse({
  title,
  status,
  meta = [],
  sample = false,
  attention = false,
  loading = false,
  onClick,
  className,
}: {
  title: string
  status?: React.ReactNode
  meta?: string[]
  sample?: boolean
  attention?: boolean
  loading?: boolean
  onClick?: () => void
  className?: string
}) {
  const Comp = onClick ? "button" : "div"

  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      data-slot={ROW_COLLAPSE_SLOT}
      data-state={loading ? "loading" : attention ? "attention" : "default"}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 border-b py-3 pr-3 pl-4 text-left",
        attention && "bg-destructive/3",
        onClick && "hover:bg-muted/50",
        className
      )}
    >
      <div className={cn("flex min-w-0 flex-1 flex-col", loading ? "gap-2" : "gap-1")}>
        {loading ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-48 rounded-md" />
              <Skeleton className="h-5.5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-60 rounded-md" />
            <Skeleton className="h-3 w-36 rounded-md" />
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-semibold tracking-tight">
                {title}
              </p>
              {status ? <div className="shrink-0">{status}</div> : null}
            </div>
            {meta.slice(0, 2).map((line, index) => (
              <p
                key={`${index}-${line}`}
                className={cn(
                  "truncate text-xs leading-4",
                  attention && index === 1
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {line}
              </p>
            ))}
            {sample ? <SampleDataTag /> : null}
          </>
        )}
      </div>
      <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </Comp>
  )
}
