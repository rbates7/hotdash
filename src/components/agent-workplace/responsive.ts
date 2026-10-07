/**
 * Agent Workplace-only layout classes. The shell PR owns shared compact
 * helpers; these stay next to the screen so this PR can land without that one.
 *
 * Breakpoints (Tailwind):
 * - default: phone (390 / 360) — stacked header, 44px tabs/filters, status switcher
 * - md (768+): tablet — header row, board scrolls sideways at 240px / column
 * - xl (1280+): unchanged 1440 desktop (5-col grid, compact chrome)
 */

export const WORKPLACE_HEADER =
  "flex flex-col items-stretch gap-3 md:min-h-10 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4"

export const WORKPLACE_HEADER_META =
  "flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 xl:w-auto"

export const WORKPLACE_DUMMY =
  "text-muted-foreground border-surface-border bg-surface shrink-0 rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] whitespace-nowrap uppercase"

/** Passed to PersistenceNote so Reset is 44px on phone/tablet. */
export const WORKPLACE_RESET = "max-xl:h-11! max-xl:px-2.5!"

/** 44px tap target on phone + tablet; desktop chrome stays as-is. */
export const WORKPLACE_TOUCH = "max-xl:h-11!"

export const WORKPLACE_TABS_LIST =
  "border-border w-full justify-start overflow-x-auto rounded-none border-b pb-[5px] max-xl:min-h-11"

export const WORKPLACE_TAB =
  "text-label flex-none px-3.5 py-1.5 font-medium tracking-tight max-xl:h-11 max-xl:px-2"

export const WORKPLACE_FILTER =
  "text-caption h-7 rounded-full border px-[11px] leading-none font-semibold tracking-tight transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none max-xl:h-11 max-xl:px-3.5 max-xl:text-label"

export const WORKPLACE_BOARD_TOOLBAR =
  "flex min-h-8 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between"

export const WORKPLACE_BOARD_META =
  "flex min-w-0 flex-wrap items-center gap-2.5"

/**
 * Scrollport. `w-0 min-w-full` takes the parent's width without feeding the
 * 5×240px track back into the page's intrinsic min-width (which is what
 * made tablet 820 scroll the document). Desktop drops the trick.
 */
export const WORKPLACE_BOARD =
  "w-0 min-w-full overflow-x-auto p-[3px] xl:w-auto xl:min-w-0 xl:overflow-visible xl:p-0"

/** Phone: one column. Tablet: 240px columns that scroll sideways. Desktop: 5-col grid. */
export const WORKPLACE_BOARD_TRACK =
  "flex flex-col gap-2 md:w-max md:flex-row md:items-start md:gap-3 xl:grid xl:w-full xl:grid-cols-5"

export const WORKPLACE_BOARD_COLUMN =
  "flex min-w-0 flex-col gap-2 max-md:w-full md:w-[240px] md:shrink-0 xl:w-auto xl:min-w-0"

export const WORKPLACE_SWITCHER =
  "flex w-full items-center gap-2 overflow-x-auto p-[3px] md:hidden"

export const WORKPLACE_SWITCHER_CHIP =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-label font-medium tracking-tight transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"

export const WORKPLACE_TICKET =
  "flex min-h-[70vh] gap-0 max-xl:flex-col"

export const WORKPLACE_TICKET_RAIL =
  "border-border w-72 shrink-0 border-l pt-14 pl-6 max-xl:w-full max-xl:border-t max-xl:border-l-0 max-xl:pt-6 max-xl:pl-0"

export const WORKPLACE_AUTOPILOT_TABLE = "max-md:block max-md:w-full"

export const WORKPLACE_AUTOPILOT_HEAD = "max-md:hidden"

export const WORKPLACE_AUTOPILOT_BODY = "max-md:block"

export const WORKPLACE_AUTOPILOT_ROW =
  "hover:bg-transparent max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-start max-md:gap-x-3 max-md:px-4 max-md:py-3"

export const WORKPLACE_AUTOPILOT_CELL =
  "max-md:block max-md:border-0 max-md:p-0! max-md:whitespace-normal!"
