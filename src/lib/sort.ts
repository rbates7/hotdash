/**
 * Column sorting for the dashboard's tables (Metrics, Sales, Clinics…).
 * Pure functions over plain rows; the table components keep the `Sort`
 * state and call these.
 */

export type SortDir = "asc" | "desc"

export type Sort<K extends string> = { key: K; dir: SortDir }

/**
 * Sort rows by one column. Numbers compare numerically, booleans false
 * before true, and everything else as text, case-insensitively via
 * localeCompare. ISO calendar days (YYYY-MM-DD) are text here: their
 * fixed-width, most-significant-first form makes lexical order equal
 * chronological order, so no date parsing is needed.
 */
export function sortRows<T, K extends keyof T & string>(
  rows: readonly T[],
  sort: Sort<K> | null
): T[] {
  if (!sort) return [...rows]
  const sign = sort.dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = a[sort.key]
    const y = b[sort.key]
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign
    if (typeof x === "boolean" && typeof y === "boolean") {
      return (Number(x) - Number(y)) * sign
    }
    return (
      String(x).localeCompare(String(y), "en", { sensitivity: "base" }) * sign
    )
  })
}

/** Click the active column to flip it; click another to sort it ascending. */
export function toggleSort<K extends string>(
  current: Sort<K> | null,
  key: K,
  defaultDir: SortDir = "asc"
): Sort<K> {
  if (current?.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" }
  }
  return { key, dir: defaultDir }
}
