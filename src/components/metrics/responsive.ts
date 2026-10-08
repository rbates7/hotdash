/**
 * Metrics layout classes. Phone / tablet / desktop follow Deke
 * `mEEFvPkzpt9woPbW5wATec` 7:47 (row-collapse + tablet ≤5 columns), the
 * Read me at 17:68, and the dense-numeric Expenses pin in 7:47 (7:141).
 * Subscriber cards map Name / Plan / Email / Signup·churn (7:383).
 *
 * There is no dedicated Metrics 390 / 820 / 1180 frame in the file — 1180
 * uses the 820 tablet layout inside the 1180 shell (same ruling as Sales).
 *
 * Breakpoints (Tailwind + `use-mobile`):
 * - phone (<768): top-bar shell, stacked cards, pinned Expenses column
 * - tablet (768–1279): rail, tables of ≤5 data columns
 * - desktop (≥1280): develop chrome, byte-identical except pressed toggles
 */

/** Page header: title then meta on phone; title | meta on md+. */
export const METRICS_HEADER =
  "flex min-h-10 flex-wrap items-center justify-between gap-4 max-md:w-full max-md:flex-col max-md:items-stretch"

export const METRICS_HEADER_META =
  "flex flex-wrap items-center gap-2.5 max-md:w-full"

/** Passed to PersistenceNote so Reset is 44px below 1280. */
export const METRICS_RESET = "max-xl:h-11! max-xl:min-w-11!"

/** 44px+ tap target on phone + tablet; `!` beats Nova's unlayered `.cn-*`. */
export const METRICS_TOUCH = "max-xl:h-11! max-xl:min-h-11! max-xl:min-w-11!"

/** Icon-only Close / trash / chart tools. `size-11!` beats `.cn-button-size-icon-*`. */
export const METRICS_ICON = "max-xl:size-11!"

/**
 * Pressed chart toggles (and any other `aria-pressed` control) are solid
 * primary at every width — Sales #29 B3 / FR #30 / CD.
 */
export const METRICS_PRESSED =
  "aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:border-primary!"

/** Phone tab scroller (Deke 7:47 / FR chips): peek + fade, 44px hits. */
export const METRICS_TABS_WRAP = "relative min-w-0"

export const METRICS_TABLIST =
  "border-border w-full justify-start overflow-x-auto rounded-none border-b pb-[5px] max-xl:h-auto! max-xl:overflow-y-hidden max-md:[-ms-overflow-style:none] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"

export const METRICS_TABS_FADE =
  "from-background pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-8 bg-gradient-to-l to-transparent max-md:block"

export const METRICS_TAB =
  "text-label flex-none px-3.5 py-1.5 font-medium tracking-tight max-xl:min-h-11! max-xl:h-11! max-xl:focus-visible:ring-inset"

/** Overview card grid: 1 / 2 / 4 as develop already does. */
export const METRICS_GRID =
  "grid w-full grid-cols-1 gap-[18px] md:grid-cols-2 min-[1680px]:grid-cols-4"

/** 16px inputs below 1280 so iOS does not zoom; 44px tall. */
export const METRICS_FIELD = "max-xl:h-11! max-xl:min-h-11! max-xl:text-base"

export const METRICS_FOOTER = "max-xl:h-11!"

/**
 * Metrics has no textarea today. If one is added, use this and nothing else
 * for height (`rows` stay; no `h-*`).
 */
export const METRICS_TEXTAREA = "max-xl:field-sizing-content max-xl:min-h-24! max-xl:text-base"

/** Dialog × and a tall form that stays on screen below 1280. */
export const METRICS_DIALOG =
  "sm:max-w-md! max-xl:[&>[data-slot=dialog-close]]:size-11! max-md:max-h-[calc(100dvh-2rem)] max-md:overflow-y-auto"

export const METRICS_DIALOG_HEADER = "max-xl:pr-10"

/**
 * Phone Add-expense / Add-metric bottom sheet. Stock Nova ×, 44×44 below
 * 1280. `!` beats unlayered `.cn-sheet-content` width / radius.
 */
export const METRICS_SHEET =
  "flex max-h-[90dvh]! w-full! max-w-none! flex-col gap-3 overflow-y-auto rounded-t-2xl! p-4! pb-[max(1rem,env(safe-area-inset-bottom))]! max-xl:[&>[data-slot=sheet-close]]:size-11!"

export const METRICS_SHEET_HEADER = "gap-1 px-0 pt-0 pb-0 max-xl:pr-14"

export const METRICS_SHEET_HANDLE =
  "bg-muted-foreground/30 mx-auto mt-2 hidden h-1 w-9 shrink-0 rounded-full max-md:block"

/** Phone-only sort control above stacked subscriber cards. */
export const METRICS_SORT = "flex items-center justify-end px-3 py-2 md:hidden"

/** SortableHead's inner button — 44px below 1280, ring inset in the scroller. */
export const METRICS_SORT_HEAD =
  "max-xl:[&_button]:min-h-11! max-xl:[&_button]:min-w-11! max-xl:[&_button]:focus-visible:ring-inset"

/**
 * Expenses: pin Category on phone only (Deke 7:141). Do not pass
 * `pinFirst` — that paints `bg-background` on the first column at every
 * width and would change desktop pixels. Phone paint matches TableCard
 * (`bg-surface`) with an inset right-edge divider. Overflow-x stays below `xl`.
 */
export const METRICS_EXPENSE_PIN =
  "xl:overflow-visible! max-md:[&_th:first-child]:bg-surface max-md:[&_td:first-child]:bg-surface max-md:[&_th:first-child]:sticky max-md:[&_td:first-child]:sticky max-md:[&_th:first-child]:left-0 max-md:[&_td:first-child]:left-0 max-md:[&_th:first-child]:z-10 max-md:[&_td:first-child]:z-10 max-md:[&_th:first-child]:shadow-[inset_-1px_0_0_var(--color-border)] max-md:[&_td:first-child]:shadow-[inset_-1px_0_0_var(--color-border)]"

export const METRICS_EXPENSE_FADE =
  "from-surface pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-7 bg-gradient-to-l to-transparent max-md:block"

/** Destructive confirm / error label — readable below 1280 only. */
export const METRICS_DANGER = "max-xl:text-danger-text!"

export const METRICS_ERROR_ACTIONS = "flex gap-2 max-md:flex-col"

/** Add-metric picker rows. */
export const METRICS_PICKER_ITEM =
  "text-label hover:bg-surface-hover flex h-9 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left font-medium max-xl:min-h-11! max-xl:focus-visible:ring-inset"
