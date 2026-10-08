/**
 * Product Roadmap layout classes. Phone / tablet follow Deke
 * `mEEFvPkzpt9woPbW5wATec` frames 13:2202, 13:2423, 13:2650 and 13:2968.
 * There is an 1180 frame (3 columns); 820 is the segmented switcher + a
 * 2-column grid of the selected column. Cards keep the desktop toolbar
 * and grow to 44px below 1280. The existing edit dialog docks as a bottom
 * sheet below `md`.
 *
 * Breakpoints (Tailwind + `use-mobile`):
 * - default / phone (<768): Now/Next/Later segments + one column of cards
 * - tablet portrait (768–1023, 820): same switcher + 2-column card grid
 * - 1180 and desktop (≥1024 / ≥1280): three columns; chrome at `xl` is unchanged
 */

/** Page header: title + New bet on phone; title | actions on md+. */
export const ROADMAP_HEADER =
  "flex min-h-10 flex-wrap items-start justify-between gap-4 max-md:w-full"

export const ROADMAP_HEADER_TITLE_ROW =
  "flex min-w-0 flex-1 items-start justify-between gap-3 md:contents"

/** Persistence + sample + (md+) New bet. Develop's row at md+; wrap only on phone. */
export const ROADMAP_HEADER_ACTIONS = "flex items-center gap-2.5 max-md:w-full max-md:flex-wrap"

/** Passed to PersistenceNote so Reset is 44px below 1280. */
export const ROADMAP_RESET = "max-xl:h-11! max-xl:min-w-11!"

/** 44px+ tap target on phone + tablet; `h-12` beats Nova sm sizing that painted 43px. */
export const ROADMAP_TOUCH = "max-xl:h-12! max-xl:min-h-12! max-xl:min-w-11!"

/** Icon-only Close / move: `size-11!` beats unlayered `.cn-button-size-icon-sm` / `icon-xs`. */
export const ROADMAP_ICON = "max-xl:size-11!"

/** Phone New bet sits beside the title; the actions-group copy is hidden. */
export const ROADMAP_PHONE_NEW_BET = "shrink-0 md:hidden"
export const ROADMAP_DESKTOP_NEW_BET = "max-md:hidden"

/**
 * Phone + 820 column switcher (Deke 13:2259, 13:2682): three equal
 * segments, 44px, no horizontal scroll — Now / Next / Later all fit.
 */
export const ROADMAP_SWITCHER =
  "bg-muted/60 flex h-12 w-full! min-w-0 items-center rounded-lg p-0.5"

export const ROADMAP_SEGMENT =
  "inline-flex h-11! min-h-11! flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-sm font-medium"

/** Pressed filters match Sales #29 (`aria-pressed:bg-primary!`) at every width. */
export const ROADMAP_PRESSED =
  "aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:border-primary!"

/**
 * Owner / Column in the existing dialogs: develop's brand wash stays at xl+.
 * Below 1280 the same items use primary so pressed vs unpressed clears 3:1.
 */
export const ROADMAP_PRESSED_BELOW_XL =
  "max-xl:aria-pressed:bg-primary! max-xl:aria-pressed:text-primary-foreground! max-xl:aria-pressed:border-primary!"

export const ROADMAP_BOARD_PHONE = "flex min-w-0 flex-col gap-2.5"
export const ROADMAP_BOARD_TABLET = "grid grid-cols-2 items-start gap-3.5"
export const ROADMAP_BOARD_DESKTOP = "grid grid-cols-3 items-start gap-3.5"

/**
 * Existing new-bet / edit dialog, docked as a bottom sheet on phone.
 * `!` beats Nova's unlayered `.cn-dialog-content` (max-width, radius) and the
 * shared `top-1/2 left-1/2 -translate-*` centering.
 */
export const ROADMAP_SHEET =
  "max-md:inset-x-0! max-md:top-auto! max-md:bottom-0! max-md:left-0! max-md:right-0! max-md:m-0! max-md:max-h-[90dvh] max-md:w-full! max-md:max-w-[100vw]! max-md:max-w-none! max-md:translate-x-0! max-md:translate-y-0! max-md:overflow-y-auto max-md:rounded-t-2xl! max-md:rounded-b-none! max-md:data-open:zoom-in-100 max-md:data-closed:zoom-out-100"

export const ROADMAP_SHEET_HANDLE =
  "bg-muted-foreground/30 mx-auto mt-2 hidden h-1 w-9 shrink-0 rounded-full max-md:block"

/** 16px inputs on phone so iOS does not zoom; 44px+ tall below 1280. */
export const ROADMAP_INPUT = "max-xl:min-h-12! max-xl:text-base"

/** Title stays `text-title-lg`; only the hit grows. `text-base` would shrink it. */
export const ROADMAP_TITLE = "max-xl:min-h-12!"

/**
 * Why field: original `rows` stay on desktop. Below 1280, min-height only
 * (`field-sizing-content`, no `h-*`) so a 280-character why is not clipped.
 */
export const ROADMAP_TEXTAREA = "max-xl:field-sizing-content max-xl:min-h-24! max-xl:text-base"

export const ROADMAP_OPTION = "max-xl:min-h-12! max-xl:min-w-11!"

/**
 * Confirm delete: develop's destructive button at xl+. Below 1280,
 * `text-danger-text` so the wash is not the only contrast (Sales #29).
 */
export const ROADMAP_CONFIRM_DELETE = "max-xl:text-danger-text!"

/** Ghost Delete: develop `text-destructive` at xl+; danger text only below 1280. */
export const ROADMAP_DELETE =
  "text-destructive hover:text-destructive max-xl:text-danger-text! max-xl:hover:text-danger-text!"

/** Card toolbar Edit: develop `h-6 px-1.5`; 44px below 1280. */
export const ROADMAP_CARD_EDIT = "text-micro ml-auto h-6 px-1.5 max-xl:h-11! max-xl:min-h-11! max-xl:px-3!"
