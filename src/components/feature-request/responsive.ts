/**
 * Feature Request layout classes. Phone / tablet / desktop follow Deke
 * `mEEFvPkzpt9woPbW5wATec` frames 13:1651, 13:1766, 13:1839, 13:1855 and
 * 13:2075. There is no Feature Request 1180 or idea-sheet frame — 1180 uses
 * the four-column board and the existing idea dialog docks as a bottom sheet
 * below `md`.
 *
 * Breakpoints (Tailwind + `use-mobile`):
 * - default / phone (<768): status chips + one column of cards
 * - tablet portrait (768–1023, 820): 2×2 columns
 * - 1180 and desktop (≥1024 / ≥1280): four columns; chrome at `xl` is unchanged
 */

/** Page header: title + New idea on phone; title | actions on md+. */
export const FR_HEADER =
  "flex min-h-10 flex-wrap items-start justify-between gap-4 max-md:w-full"

export const FR_HEADER_TITLE_ROW =
  "flex min-w-0 flex-1 items-start justify-between gap-3 md:contents"

/** Persistence + sample + (md+) New idea. Full width under the title on phone. */
export const FR_HEADER_ACTIONS = "flex flex-wrap items-center gap-2.5 max-md:w-full"

/** Passed to PersistenceNote so Reset is 44px below 1280. */
export const FR_RESET = "max-xl:h-11! max-xl:px-2.5!"

/** 44px+ tap target on phone + tablet; `h-12` beats Nova sm sizing that painted 43px. */
export const FR_TOUCH = "max-xl:h-12! max-xl:min-h-12! max-xl:min-w-11!"

/** Icon-only Close: `size-11!` beats unlayered `.cn-button-size-icon-sm` (`size-7`). */
export const FR_ICON = "max-xl:size-11!"

/** Phone New idea sits beside the title; the actions-group copy is hidden. */
export const FR_PHONE_NEW_IDEA = "shrink-0 md:hidden"
export const FR_DESKTOP_NEW_IDEA = "max-md:hidden"

/** Phone status chips (Deke 13:1839): Parked peeks; fade sits on the wrapper. */
export const FR_CHIPS_WRAP = "relative min-w-0"

export const FR_CHIPS =
  "flex w-full min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

/** Right-edge cue so Parked is not cut off with no hint (theme `background`). */
export const FR_CHIPS_FADE =
  "from-background pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l to-transparent"

export const FR_CHIP =
  "inline-flex h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-medium whitespace-nowrap"

/** Pressed filter pills match Community Development (`aria-pressed:bg-primary!`). */
export const FR_PRESSED =
  "aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:border-primary!"

export const FR_CHIP_ON = FR_PRESSED

export const FR_CHIP_OFF = "bg-background text-foreground border-border"

/** Count is tabular only — `min-w-5` made the pills too wide for 13:1839. */
export const FR_CHIP_COUNT = "text-caption font-semibold tabular-nums"

/** Four-column intake: 2×2 on tablet portrait, 4-across from 1024 (1180 + desktop). */
export const FR_BOARD_PHONE = "flex min-w-0 flex-col gap-2.5"
export const FR_BOARD_TABLET = "grid grid-cols-2 items-start gap-3.5"
export const FR_BOARD_DESKTOP = "grid grid-cols-4 items-start gap-3.5"

/**
 * Existing idea / new-idea dialog, docked as a bottom sheet on phone.
 * `!` beats Nova's unlayered `.cn-dialog-content` (max-width, radius) and the
 * shared `top-1/2 left-1/2 -translate-*` centering.
 */
export const FR_SHEET =
  "max-md:inset-x-0! max-md:top-auto! max-md:bottom-0! max-md:left-0! max-md:right-0! max-md:m-0! max-md:max-h-[90dvh] max-md:w-full! max-md:max-w-[100vw]! max-md:max-w-none! max-md:translate-x-0! max-md:translate-y-0! max-md:overflow-y-auto max-md:rounded-t-2xl! max-md:rounded-b-none! max-md:data-open:zoom-in-100 max-md:data-closed:zoom-out-100"

export const FR_SHEET_HANDLE =
  "bg-muted-foreground/30 mx-auto mt-2 hidden h-1 w-9 shrink-0 rounded-full max-md:block"

/** 16px From/ask on phone so iOS does not zoom; 44px+ tall below 1280. */
export const FR_INPUT = "max-xl:min-h-12! max-xl:text-base"

/** Title stays `text-title-lg`; only the hit grows. `text-base` would shrink it. */
export const FR_TITLE = "max-xl:min-h-12!"

/**
 * Ask field: original `rows` stay on desktop. Below 1280, min-height only
 * (`field-sizing-content`, no `h-*`) so a 280-character ask is not clipped.
 */
export const FR_TEXTAREA = "max-xl:field-sizing-content max-xl:min-h-24! max-xl:text-base"

export const FR_STATUS = "max-xl:min-h-12! max-xl:min-w-11!"

/**
 * Confirm delete: develop's destructive button at xl+. Below 1280, outline +
 * `text-danger-text` so the wash is not the only contrast (Sales #29).
 */
export const FR_CONFIRM_DELETE =
  "max-xl:border-border! max-xl:bg-transparent! max-xl:text-danger-text! max-xl:hover:bg-muted! max-xl:hover:text-danger-text! max-xl:shadow-none!"

/** On Roadmap hint: small pill (Deke 13:1855), not a full-width grey bar. */
export const FR_ROADMAP_HINT =
  "bg-muted text-foreground/80 ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-[3px] text-[10px] leading-[1.2] font-semibold whitespace-nowrap max-xl:text-foreground"
