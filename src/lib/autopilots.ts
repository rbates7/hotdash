import { CENTRAL } from "@/lib/clock"
import type { AutopilotSchedule } from "@/lib/workplace-fixture"

/** Wall-clock parts of an instant in a time zone. */
type Wall = {
  year: number
  month: number // 1–12
  day: number
  hour: number
  minute: number
  weekday: number // 0 = Sunday
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function wallClock(date: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  }
}

/**
 * The next time a schedule fires, as a calendar offset in whole days from
 * the given wall-clock "today" plus a time of day. Day arithmetic stays on
 * the calendar (not milliseconds) so DST never shifts an 8:00am run.
 */
export function nextRun(
  schedule: AutopilotSchedule,
  now: Date,
  timeZone = CENTRAL
): { daysAhead: number; hour: number; minute: number } {
  const wall = wallClock(now, timeZone)
  const nowMinutes = wall.hour * 60 + wall.minute

  switch (schedule.kind) {
    case "daily": {
      const minute = schedule.minute ?? 0
      const fires = schedule.hour * 60 + minute
      return { daysAhead: fires > nowMinutes ? 0 : 1, hour: schedule.hour, minute }
    }
    case "weekly": {
      const minute = schedule.minute ?? 0
      const fires = schedule.hour * 60 + minute
      let daysAhead = (schedule.weekday - wall.weekday + 7) % 7
      if (daysAhead === 0 && fires <= nowMinutes) daysAhead = 7
      return { daysAhead, hour: schedule.hour, minute }
    }
    case "every-hours": {
      // Fires on the hour at multiples of the interval from midnight.
      const next = (Math.floor(wall.hour / schedule.hours) + 1) * schedule.hours
      return next >= 24
        ? { daysAhead: 1, hour: next - 24, minute: 0 }
        : { daysAhead: 0, hour: next, minute: 0 }
    }
  }
}

/** "8:00am" style clock label. */
export function formatClock(hour: number, minute: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const mm = String(minute).padStart(2, "0")
  return `${h12}:${mm}${hour < 12 ? "am" : "pm"}`
}

/**
 * The Autopilots "next run" cell: "Today · 8:00am CT", "Tomorrow · …", or
 * "Mon 12 Oct · 9:00am CT" for anything further out.
 */
export function nextRunLabel(
  schedule: AutopilotSchedule,
  now: Date,
  timeZone = CENTRAL
) {
  const run = nextRun(schedule, now, timeZone)
  const time = `${formatClock(run.hour, run.minute)} CT`
  if (run.daysAhead === 0) return `Today · ${time}`
  if (run.daysAhead === 1) return `Tomorrow · ${time}`
  const today = wallClock(now, timeZone)
  // Calendar day arithmetic in UTC on the wall-clock date, so the label is
  // the right weekday and date in the founder's zone.
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day + run.daysAhead))
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} · ${time}`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
