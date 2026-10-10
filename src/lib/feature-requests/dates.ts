/**
 * Wall-clock date maths for the Feature Request seed, on top of the shared
 * clock (`@/lib/clock`): `formatDate`, `formatRelative`, `formatRelativeDay`,
 * `daysBetween` and `CENTRAL` come from there. What lives here is the one
 * thing the shared clock does not do — move an *instant* back N Central
 * calendar days while keeping its wall-clock time, so the seed's
 * "2 days ago" (`formatRelativeDay`) survives a DST change.
 *
 * Pure: nothing here reads the clock. The instant "now" is read once per
 * request in the page and handed down as `nowMs`.
 */
import { CENTRAL } from "@/lib/clock"

/** Wall-clock fields of an instant in Central. */
export type Wall = {
  y: number
  m: number
  d: number
  h: number
  min: number
  s: number
}

// Built on first use, not at import, so a test can set process.env.TZ and
// re-import without a stale instance.
let partsFormat: Intl.DateTimeFormat | undefined
function parts(): Intl.DateTimeFormat {
  return (partsFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }))
}

export function centralWall(date: Date): Wall {
  const p: Record<string, number> = {}
  for (const part of parts().formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value)
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute, s: p.second }
}

const wallAsUtc = (w: Wall) => Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s)

/**
 * The instant at which Central shows `wall`. Fields may overflow (day 0,
 * day 35…) and are normalised the way `Date.UTC` does. Two correction passes
 * absorb a DST offset change between the guess and the answer.
 */
export function instantAtCentralWall(wall: Wall): Date {
  const target = wallAsUtc(wall)
  let t = target
  for (let i = 0; i < 2; i++) {
    t += target - wallAsUtc(centralWall(new Date(t)))
  }
  return new Date(t)
}

/** Same Central wall-clock time, `days` calendar days earlier. */
export function calendarDaysBefore(days: number, from: Date): Date {
  const w = centralWall(from)
  return instantAtCentralWall({ ...w, d: w.d - days })
}
