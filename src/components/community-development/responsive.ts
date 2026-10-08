/**
 * Community Development phone / tablet classes. No Community Development
 * frame in Deke `mEEFvPkzpt9woPbW5wATec` — phone cards follow 7:47
 * (Name / Status / Type · Partner / When · Owner) and Clinics 10:821;
 * tablet tables follow 7:47 (≤5 columns) and Clinics 10:1281. 1180 uses
 * the 820 layout. ≥1280 chrome is develop's, byte-for-byte.
 */

/** Passed to PersistenceNote so Reset is 44px below 1280 (Sales #29). */
export const CD_RESET = "max-xl:h-11! max-xl:min-w-11!"

/** 44px below xl (phone + tablet). Desktop ≥1280 keeps Nova h-8 / h-7. */
export const CD_TOUCH = "max-xl:h-11! max-xl:min-h-[44px]!"

/** Add initiative: 44px below xl; h-9 at ≥1280. */
export const CD_ADD = "max-xl:h-11! max-xl:min-h-11! max-xl:px-4! xl:h-9 xl:px-3.5"

/**
 * Nova `.cn-sheet-content` pins w-3/4 + sm:max-w-sm on side sheets. Beat it.
 * The stock × (`cn-sheet-close`) grows to 44×44 below 1280.
 */
export const CD_SHEET =
  "flex max-h-[90dvh]! w-full! max-w-none! flex-col overflow-y-auto rounded-t-xl! p-4! max-xl:[&>[data-slot=sheet-close]]:size-11! max-xl:[&>[data-slot=sheet-close]]:min-h-[44px]! max-xl:[&>[data-slot=sheet-close]]:min-w-[44px]!"

/** Dialog × is icon-sm (28px). Beat it below xl; 1440 stays Nova. */
export const CD_DIALOG =
  "max-xl:max-h-[90dvh]! max-xl:overflow-y-auto! max-xl:[&_[data-slot=dialog-close]]:size-11! max-xl:[&_[data-slot=dialog-close]]:min-h-[44px]! max-xl:[&_[data-slot=dialog-close]]:min-w-[44px]! max-md:max-h-[calc(100dvh-2rem)]"

/** Keeps the title and description clear of the 44px ×. */
export const CD_HEADER = "max-xl:pr-10"

/** Two fields side by side on tablet and desktop, stacked on a phone. */
export const CD_PAIR = "max-md:grid-cols-1"

/**
 * Type / Status options sit in two columns on phone so "Outreach event"
 * shares a row with "Foundation program" instead of wrapping alone.
 * `grid!` / `w-full!` beat Nova's flex + w-fit.
 */
export const CD_TOGGLE_GROUP = "max-md:grid! max-md:w-full! max-md:grid-cols-2"

/** Owner stays top-aligned with the taller Impact textarea below 1280. */
export const CD_OWNER_IMPACT = "max-xl:items-start"

/** Pressed filters / form toggles: solid primary at every width. */
export const CD_PRESSED = "aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"

export const CD_FILTER_ITEM =
  "text-label px-3 first:rounded-l-lg last:rounded-r-lg max-xl:h-11! max-xl:min-w-11! max-md:shrink-0"

/** Phone: both filter groups scroll as one row; Status peeks; fade on the wrap. */
export const CD_FILTERS_WRAP = "relative min-w-0"

export const CD_FILTERS =
  "flex min-w-0 items-center gap-3 max-md:overflow-x-auto max-md:overscroll-x-contain max-md:pb-0.5 max-md:[-ms-overflow-style:none] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden md:flex-wrap"

export const CD_FILTERS_FADE =
  "from-background pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-8 bg-gradient-to-l to-transparent max-md:block"

export const CD_FILTER_GROUP = "bg-surface shrink-0 rounded-lg"

/**
 * Impact: original `rows` stay on desktop. Below 1280, min-height only
 * (`field-sizing-content`, no `h-*`) so 280 characters are not clipped.
 */
export const CD_TEXTAREA = "max-xl:field-sizing-content max-xl:min-h-24!"

/** Inputs: 16px below 1280 so iOS does not zoom (Read me 17:68). */
export const CD_INPUT = "max-xl:h-11! max-xl:min-h-[44px]! max-xl:text-base"

/**
 * Nova's destructive button text is below 4.5:1 on its own tint. Below 1280
 * it uses the text-safe danger token. Desktop keeps develop's look.
 */
export const CD_DESTRUCTIVE = "max-xl:text-danger-text!"

/** Menu rows: 44px below 1280 (tablet … and phone sheet confirm paths). */
export const CD_MENU_ITEM = "max-xl:min-h-11"

/** Tablet (768–1279) hides Partner and Impact; they fold under Name. */
export const TABLET_HIDE = "hidden xl:table-cell"

/**
 * Nova `.cn-table-cell` nowrap beats `CELL`. Below xl the Name column is the
 * one that yields: constrain it so Status and the ⋯ stay inside the card.
 */
export const TABLET_NAME_CELL = "max-xl:max-w-0 max-xl:min-w-0! max-xl:whitespace-normal!"

/**
 * Name link: desktop keeps wrap + overflow-wrap. Below xl, real single-line
 * truncation (`whitespace-nowrap!` so Nova's truncate nowrap can apply) and
 * left justify so the name starts at the cell edge, not centered in h-8.
 */
export const CD_NAME_LINK =
  "text-label text-foreground h-auto min-w-0 max-w-full shrink whitespace-normal! p-0 text-left font-semibold tracking-tight [overflow-wrap:anywhere] max-xl:justify-start max-xl:overflow-hidden max-xl:whitespace-nowrap!"

/** Inner span: `truncate` only below xl so desktop names still wrap. */
export const CD_NAME_TEXT = "min-w-0 max-xl:block max-xl:truncate"

/**
 * Right-side View sheet. Desktop keeps develop's `sm:max-w-md`. On phone
 * Nova's `w-3/4` (292px at 390) loses to `max-md:w-full! max-md:max-w-none!`.
 */
export const CD_DETAIL_SHEET =
  "flex w-full flex-col sm:max-w-md max-md:w-full! max-md:max-w-none! max-xl:[&>[data-slot=sheet-close]]:size-11! max-xl:[&>[data-slot=sheet-close]]:min-h-[44px]! max-xl:[&>[data-slot=sheet-close]]:min-w-[44px]!"
