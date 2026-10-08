/**
 * My Desk layout classes. No phone or tablet frame in Deke
 * `mEEFvPkzpt9woPbW5wATec` (Read me 17:68 lists My Desk under other screens;
 * 7:47 is the row-collapse rule, and My Desk is not in that mapping). Phone
 * and tablet follow Sales #29 / Bugs #31: records become cards, 1180 uses
 * the 820 stacked panes, desktop (≥1280) keeps develop's two-column row.
 *
 * Breakpoints (Tailwind):
 * - default / phone (<768): stacked panes, cards, bottom sheet
 * - tablet (768–1279, 820 and 1180): stacked panes, cards, inline 44px actions
 * - xl (≥1280): develop's side-by-side Today + Notes list
 */

/** Page header: stack on phone; develop's wrap row from md up. */
export const DESK_HEADER =
  "relative flex flex-wrap items-start justify-between gap-4 max-md:flex-col max-md:items-stretch max-md:gap-3"

/** Title block clears the absolute Add to-do on phone. */
export const DESK_HEADER_TITLE = "min-w-0 max-md:pr-[132px]"

export const DESK_HEADER_ACTIONS =
  "mt-1 flex shrink-0 flex-wrap items-center gap-2.5 max-md:mt-0"

/** Passed to PersistenceNote so Reset is 44px below 1280. */
export const DESK_RESET = "max-xl:h-11! max-xl:min-w-11!"

/** Add to-do: develop's h-9 at xl+; 44px below 1280. Phone pins it to the title. */
export const DESK_ADD =
  "h-9 px-3.5 max-xl:h-11! max-xl:min-h-11! max-xl:px-4! max-md:absolute max-md:top-0 max-md:right-0"

export const DESK_ADD_INLINE = "h-9 px-3.5 max-xl:h-11! max-xl:min-h-11! max-xl:px-4!"

/** Today + Notes: one column below 1280 (820 and 1180 match); two at xl. */
export const DESK_PANES =
  "grid min-h-[min(560px,calc(100svh-10rem))] flex-1 grid-cols-1 items-stretch gap-4 xl:grid-cols-2"

/**
 * Develop's list row, plus a card below 1280. `first:border-t-0` is restored
 * on the card so the first item keeps a full outline.
 */
export const DESK_ROW =
  "flex items-start gap-3 border-t border-border px-2.5 py-3 first:border-t-0 max-xl:flex-col max-xl:overflow-hidden max-xl:rounded-xl max-xl:border max-xl:px-3.5 max-xl:py-3.5 max-xl:first:border-t"

export const DESK_ROW_BODY = "flex min-w-0 flex-1 items-start gap-3 max-xl:w-full"

/**
 * The 16px checkbox at xl+; 44×44 below 1280. `!` beats Nova's unlayered
 * `icon-xs` size. Inset ring so overflow on the card cannot clip it.
 */
export const DESK_CHECK =
  "mt-0.5 size-4 rounded-[4px] border max-xl:mt-0 max-xl:size-11! max-xl:rounded-md max-xl:focus-visible:ring-inset"

/** Phone-only open control. Hidden from md up, where Edit/Delete stay on the card. */
export const DESK_OPEN =
  "text-muted-foreground size-11! shrink-0 md:hidden max-xl:focus-visible:ring-inset"

/** Edit / Delete: on the row at md+; 44px below 1280; hidden on phone (sheet). */
export const DESK_ACTIONS =
  "flex shrink-0 items-center gap-1 max-xl:w-full max-xl:gap-2 max-md:hidden"

export const DESK_ACTION = "max-xl:h-11! max-xl:min-h-11! max-xl:min-w-11! max-xl:flex-1"

/** Restyled destructive text below 1280 only. Desktop stays develop's outline Delete. */
export const DESK_DELETE_TEXT = "max-xl:text-danger-text!"

export const DESK_UNDO = "max-xl:h-11! max-xl:min-h-11! max-xl:min-w-11!"

/**
 * The popup: stock × grows to 44×44; on a phone a tall form scrolls inside
 * the screen instead of running off it.
 */
export const DESK_DIALOG =
  "max-xl:[&>[data-slot=dialog-close]]:size-11! max-md:max-h-[calc(100dvh-2rem)] max-md:overflow-y-auto"

export const DESK_HEADER_PAD = "max-xl:pr-10"

export const DESK_FIELD = "max-xl:h-11!"

export const DESK_FOOTER = "max-xl:h-11!"

/**
 * Keep develop's `rows`. Below 1280, min-height only (`field-sizing-content`,
 * no `h-*`) so 280 characters are not clipped.
 */
export const DESK_TEXTAREA = "max-xl:field-sizing-content max-xl:min-h-24!"

/** Done in the edit dialog: the native box and its label are the 44px hit. */
export const DESK_DONE =
  "text-caption flex items-center gap-2 font-medium max-xl:min-h-11 max-xl:min-w-11"

export const DESK_DONE_INPUT = "size-4 accent-foreground max-xl:size-11!"

/**
 * The stock Nova × (`cn-sheet-close`) as a 44×44 hit below 1280; `!` beats
 * Nova's unlayered `icon-sm` size.
 */
export const DESK_SHEET_CLOSE = "max-xl:[&>[data-slot=sheet-close]]:size-11!"

export const DESK_SHEET_ACTION =
  "hover:bg-muted focus-visible:ring-ring/50 flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"

/** Scratch: develop's min-height at xl+; content-sized floor + inset ring below. */
export const DESK_SCRATCH =
  "min-h-[220px] flex-1 resize-none rounded-md border-0 bg-transparent p-0 shadow-none focus-visible:ring-2 focus-visible:ring-ring max-xl:field-sizing-content max-xl:min-h-24! max-xl:focus-visible:ring-inset"
