// What every list view shares: the date windows its filters offer, and the
// parsing of the query string that holds its state. Dependency-free on
// purpose, so client components can import the constants.

/** Windows offered by date filters, in days back from now. */
export const DAY_WINDOWS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const
export type DayWindow = keyof typeof DAY_WINDOWS

export type SortDirection = "asc" | "desc"

const DAY_MS = 24 * 60 * 60 * 1000

export function sinceWindow(window: DayWindow, now = Date.now()): Date {
  return new Date(now - DAY_WINDOWS[window] * DAY_MS)
}

/** A `?window=`-style param, or undefined when it is not one we offer. */
export function parseWindow(value: string | undefined): DayWindow | undefined {
  return value && value in DAY_WINDOWS ? (value as DayWindow) : undefined
}

/** The `?offset=` param: a whole number of rows to skip, else page one. */
export function parseOffset(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

export function parseDirection(
  value: string | undefined,
  fallback: SortDirection = "desc"
): SortDirection {
  return value === "asc" || value === "desc" ? value : fallback
}

/** `value` when it is one of `options`, else undefined. */
export function parseOneOf<T extends string>(
  options: readonly T[],
  value: string | undefined
): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined
}
