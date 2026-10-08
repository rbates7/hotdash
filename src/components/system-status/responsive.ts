/**
 * System Status-only layout classes. The shell PR owns shared compact
 * helpers; these stay next to the screen.
 *
 * Breakpoints (Tailwind):
 * - default: phone (390 / 360) — stacked header, full-width preview, stacked rows
 * - md (768+): tablet — header row, banner/rows stay side-by-side
 * - xl (1280+): unchanged 1440 desktop (preview stays h-8)
 */
export const STATUS_HEADER =
  "flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-4"

export const STATUS_HEADER_META =
  "flex min-w-0 flex-col gap-3 max-md:w-full max-md:items-start md:mt-1 md:flex-row md:flex-wrap md:items-center md:gap-2.5"

/** Sample chip sits above the preview on phone; after it from md up. */
export const STATUS_HEADER_CHIP = "h-6 px-2 max-md:order-first md:order-last"

export const STATUS_PREVIEW =
  "bg-muted inline-flex items-center rounded-lg p-[3px] max-md:w-full xl:h-8"

export const STATUS_PREVIEW_OPTION =
  "text-caption flex items-center rounded-[6px] px-2.5 font-medium tracking-tight transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none max-xl:min-h-11 max-md:flex-1 max-md:justify-center whitespace-nowrap xl:h-full xl:flex-none"

export const STATUS_BANNER =
  "flex flex-col gap-3 rounded-xl border px-[18px] py-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-[22px]"

export const STATUS_BANNER_META =
  "text-caption text-muted-foreground font-medium tracking-tight tabular-nums max-md:pl-10 md:flex-none md:text-right"

/** Phone service-name links meet the 44px tap target. */
export const STATUS_ROW_LINK = "max-md:min-h-11"

export const STATUS_ROW =
  "border-border/70 hover:bg-surface-hover grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b px-4 py-3 last:border-b-0 [grid-template-areas:'name_status'_'reason_reason'_'time_time'] md:min-h-[56px] md:items-center md:gap-y-[3px] md:px-5 md:py-2.5 md:[grid-template-areas:'name_status'_'reason_time']"

export const STATUS_INCIDENT =
  "flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-4"
