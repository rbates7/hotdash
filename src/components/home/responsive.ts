/**
 * Home-only layout classes. The shell PR owns shared compact helpers;
 * these stay next to the screen so this PR can land without that one.
 *
 * Breakpoints (Tailwind):
 * - default: phone (390 / 360)
 * - md (768+): tablet 2-up / 2+1 doors
 * - xl (1280+): unchanged 1440 desktop
 */
export const HOME_HEADER =
  "flex flex-col items-stretch gap-3 max-md:w-full xl:flex-row xl:items-start xl:justify-between xl:gap-4"

/**
 * Persistence + dummy chip sit under the title below `md` (768). They wrap
 * as whole chips (`shrink-0`) so the stamp never ellipsizes to
 * “DUMMY / DESIGN MO…”.
 */
export const HOME_HEADER_META =
  "flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 max-md:pt-0 xl:mt-1 xl:w-auto xl:shrink-0 xl:gap-2.5"

/** Dummy / design-mock stamp — never shrink or truncate. */
export const HOME_DUMMY =
  "text-muted-foreground border-surface-border bg-surface shrink-0 rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] whitespace-nowrap uppercase"

/** Passed to PersistenceNote so Reset is 44px on phone/tablet. */
export const HOME_RESET = "max-xl:h-11! max-xl:px-2.5!"

export const HOME_DOORS =
  "grid min-h-[200px] flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"

/** Inbox sits full-width under the first two doors on tablet. */
export const HOME_INBOX_DOOR = "md:col-span-2 xl:col-span-1"

/** Dev-board counters wrap 3-up on phone/tablet; five columns at 1440. */
export const HOME_BOARD_COLUMNS = "grid grid-cols-3 gap-1.5 xl:grid-cols-5"

export const HOME_KPI_HEAD =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-0.5"

/** 44px tap target on phone + tablet; desktop chrome stays as-is. */
export const HOME_TOUCH = "max-xl:h-11!"
