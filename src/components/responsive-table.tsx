import type { ComponentProps, ReactNode } from "react"
import { ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SampleDataTag } from "@/components/sample-data"
import { Skeleton } from "@/components/ui/skeleton"

export const RESPONSIVE_TABLE_SLOT = "responsive-table"
export const ROW_COLLAPSE_SLOT = "row-collapse"

export type RowCollapseMeta = {
  label: string
  value: string
}

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
 * - `stack` without `stacked` falls back to the same horizontal scroller.
 */
export function ResponsiveTable({
  children,
  stacked,
  layout = "scroll",
  pinFirst = false,
  className,
  ...props
}: ComponentProps<"div"> & {
  stacked?: ReactNode
  layout?: "scroll" | "stack"
  pinFirst?: boolean
}) {
  const showStack = layout === "stack" && Boolean(stacked)

  return (
    <div
      data-slot={RESPONSIVE_TABLE_SLOT}
      data-layout={layout}
      data-pin-first={pinFirst || undefined}
      className={cn(
        "w-full min-w-0 max-w-full",
        !showStack && "overflow-x-auto overscroll-x-contain",
        pinFirst &&
          "[&_th:first-child]:bg-background [&_td:first-child]:bg-background [&_th:first-child]:sticky [&_td:first-child]:sticky [&_th:first-child]:left-0 [&_td:first-child]:left-0 [&_th:first-child]:z-10 [&_td:first-child]:z-10",
        className
      )}
      {...props}
    >
      {showStack ? (
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
 * Phone record-list card (Deke 7:46). Title + status pill + labelled meta
 * pairs + chevron. Whole row is the tap target (min 64). `onClick` should
 * open the screen's existing row dialog as a bottom sheet — wiring is per-screen.
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
  status?: ReactNode
  meta?: RowCollapseMeta[]
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
      aria-busy={loading || undefined}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 border-b py-3 pr-3 pl-4 text-left",
        attention && "bg-destructive/3",
        onClick && "hover:bg-muted/50",
        className
      )}
    >
      <span className={cn("flex min-w-0 flex-1 flex-col", loading ? "gap-2" : "gap-1")}>
        {loading ? (
          <>
            <span className="sr-only">Loading</span>
            <span className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-48 rounded-md" />
              <Skeleton className="h-5.5 w-14 rounded-full" />
            </span>
            <Skeleton className="h-3 w-60 rounded-md" />
            <Skeleton className="h-3 w-36 rounded-md" />
          </>
        ) : (
          <>
            <span className="flex items-start gap-2">
              <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-semibold tracking-tight">
                {title}
              </span>
              {status ? <span className="shrink-0">{status}</span> : null}
            </span>
            {meta.length > 0 ? (
              <ul className="flex min-w-0 flex-col gap-1">
                {meta.map((line) => (
                  <li
                    key={`${line.label}-${line.value}`}
                    className={cn(
                      "truncate text-xs leading-4",
                      attention && line === meta[1]
                        ? "text-destructive font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    <span className="sr-only">{line.label}: </span>
                    <span>{line.value}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {sample ? <SampleDataTag /> : null}
          </>
        )}
      </span>
      <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </Comp>
  )
}
