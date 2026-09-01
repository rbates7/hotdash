/**
 * How far back the first Gmail backfill reaches. Two shapes are accepted:
 *
 *   30d, 8m, 2y   relative, handed to Gmail's `newer_than:` operator
 *   2026-01-01    an absolute date, handed to Gmail's `after:` operator
 *
 * A relative window drifts: `8m` means something different next month, so a
 * re-sync after a history gap would quietly reach back further than the one
 * before it. An absolute date stays put, which is what you want when
 * backfilling from a known starting point.
 *
 * Kept dependency-free so `pnpm crm:doctor` can validate the env value
 * without pulling in the database driver.
 */
const RELATIVE = /^\d+[dmy]$/
const ABSOLUTE = /^(\d{4})-(\d{2})-(\d{2})$/

export const DEFAULT_SYNC_WINDOW = "30d"

/** The Gmail search fragment for a window, or null if it is malformed. */
export function syncWindowQuery(window: string): string | null {
  const value = window.trim()
  if (RELATIVE.test(value)) return `newer_than:${value}`

  const match = ABSOLUTE.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  // Gmail's date operators want slashes. Round-trip through Date first so an
  // impossible date (2026-02-31) is rejected here rather than silently
  // matching nothing on Gmail's side.
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`)
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null
  }
  return `after:${year}/${month}/${day}`
}

export function isValidSyncWindow(window: string): boolean {
  return syncWindowQuery(window) !== null
}
