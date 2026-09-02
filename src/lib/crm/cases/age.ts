// How old a case is, and when it has waited too long. Pure functions with a
// `now` you can pass in, so they are easy to test and so the SQL versions in
// cases/server.ts have something to be checked against.

/** After this many days waiting on your reply, a case is overdue. */
export const OVERDUE_THRESHOLD_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export type AgeInput = {
  status: string
  createdAt: Date
  lastInboundAt: Date | null
  lastOutboundAt: Date | null
}

/** True when their message is the newest thing on the case. */
export function theySpokeLast(input: AgeInput): boolean {
  return (
    input.lastInboundAt !== null &&
    (input.lastOutboundAt === null || input.lastInboundAt > input.lastOutboundAt)
  )
}

/**
 * The moment a case's age counts from: when they last wrote, if the ball is
 * with you; otherwise when the case was opened. "Age" therefore reads as
 * "how long have they been waiting on me" whenever that is the question.
 */
export function ageAnchor(input: AgeInput): Date {
  return theySpokeLast(input) ? input.lastInboundAt! : input.createdAt
}

export function caseAgeMs(input: AgeInput, now = Date.now()): number {
  return Math.max(0, now - ageAnchor(input).getTime())
}

/** Waiting on your reply for OVERDUE_THRESHOLD_DAYS or more, and not closed. */
export function isOverdue(input: AgeInput, now = Date.now()): boolean {
  return (
    input.status !== "closed" &&
    theySpokeLast(input) &&
    now - input.lastInboundAt!.getTime() >= OVERDUE_THRESHOLD_DAYS * DAY_MS
  )
}
