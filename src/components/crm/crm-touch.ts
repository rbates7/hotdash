/*
 * Below 1280 every CRM control is a 44px hit (phone and tablet). Nova's
 * `.cn-*` classes are unlayered, hence the `!`. Every rule is scoped to
 * `max-xl:` so desktop (≥1280) keeps develop's sizes untouched.
 */

/** Buttons, inputs and select triggers: 44 tall. */
export const CRM_44 = "max-xl:h-11!"
/** Icon buttons: 44×44. */
export const CRM_ICON_44 = "max-xl:size-11!"
/** Select options, menu rows and list rows: at least 44 tall. */
export const CRM_ROW_44 = "max-xl:min-h-11"
/**
 * Nova's destructive text is 3.7:1 on its own tint; below 1280 it uses the
 * text-safe danger token. Desktop keeps develop's look.
 */
export const CRM_DANGER_TEXT = "max-xl:text-danger-text!"
/**
 * Dialog popups: the stock × grows to 44×44, and on a phone a tall form
 * scrolls inside the screen instead of running off it.
 */
export const CRM_DIALOG =
  "max-xl:[&>[data-slot=dialog-close]]:size-11! max-md:max-h-[calc(100dvh-2rem)] max-md:overflow-y-auto"
/** Keeps a dialog's title and description clear of the 44px ×. */
export const CRM_DIALOG_HEADER = "max-xl:pr-10"
/** Persistence note Reset, through the shared note's `resetClassName`. */
export const CRM_RESET = "max-xl:h-11! max-xl:min-w-11!"
/** Text links that act as targets (breadcrumbs, list rows): 44 tall, 44 wide. */
export const CRM_LINK_44 = "max-xl:inline-flex max-xl:min-h-11 max-xl:min-w-11 max-xl:items-center"
