/**
 * The System Status model: "Is Chlk up. Green / not green."
 *
 * Nothing here polls anything. Sentry and chlkapp.com are not connected
 * yet, so the page renders one of two *seeded* scenarios — the all-green
 * one and the mock's degraded one — generated against the request's
 * instant (`nowMs`), the same way the Home and Workplace fixtures are.
 * Every "checked N min ago" is measured from that one instant, so the
 * server HTML and the client agree to the minute.
 */

import { CENTRAL, addDays, formatRelative, todayIn } from "@/lib/clock"

/* ----------------------------------------------------------------- model */

/** Traffic-light states. `down` is the red one. */
export type ServiceStatus = "operational" | "degraded" | "down"

export type Service = {
  id: string
  name: string
  status: ServiceStatus
  /** One short clause saying why the status is what it is. */
  reason: string
  /** When the (seeded) check ran, as an epoch instant. */
  checkedAtMs: number
  /** Where the real thing lives; shown as a plain external link. */
  href?: string
}

export type PastIncident = {
  /** "Resolved · Sync delay after the iPad 1.4 push. Cleared in 41 min." */
  summary: string
  /** YYYY-MM-DD, Central. */
  day: string
}

/** The two seeded views the page can show. */
export type Scenario = "green" | "not-green"
export const SCENARIOS: readonly Scenario[] = ["green", "not-green"]
export const DEFAULT_SCENARIO: Scenario = "green"

export function isScenario(value: unknown): value is Scenario {
  return typeof value === "string" && (SCENARIOS as readonly string[]).includes(value)
}

/** The URL query that picks the preview, e.g. `/system-status?preview=not-green`. */
export const PREVIEW_PARAM = "preview"

export const SENTRY_HREF = "https://chlk.sentry.io"
export const SITE_HREF = "https://chlkapp.com"

/* ------------------------------------------------------------------ seed */

type SeedRow = Omit<Service, "checkedAtMs"> & { checkedMinutesAgo: number }

/**
 * The mock's component list, in its order, plus the Sentry row the brief
 * asks for ("Sentry and the site"). Every row carries a reason so the page
 * never shows a bare colour; the degraded Billing row is the only thing
 * the not-green scenario changes.
 */
const SEED: Record<Scenario, SeedRow[]> = {
  green: [
    { id: "ipad", name: "iPad app API", status: "operational", reason: "Responding normally", checkedMinutesAgo: 2 },
    { id: "sync", name: "Sync", status: "operational", reason: "Queue empty · nothing waiting", checkedMinutesAgo: 2 },
    { id: "auth", name: "Auth", status: "operational", reason: "Sign-ins completing", checkedMinutesAgo: 3 },
    { id: "billing", name: "Billing", status: "operational", reason: "Stripe webhooks on time", checkedMinutesAgo: 4 },
    { id: "site", name: "chlkapp.com", status: "operational", reason: "Site up · 200 from Dallas", checkedMinutesAgo: 2, href: SITE_HREF },
    { id: "export", name: "Export", status: "operational", reason: "Exports finishing", checkedMinutesAgo: 6 },
    { id: "sentry", name: "Sentry errors (24h)", status: "operational", reason: "3 errors · nothing new", checkedMinutesAgo: 5, href: SENTRY_HREF },
  ],
  "not-green": [
    { id: "ipad", name: "iPad app API", status: "operational", reason: "Responding normally", checkedMinutesAgo: 2 },
    { id: "sync", name: "Sync", status: "operational", reason: "Queue empty · nothing waiting", checkedMinutesAgo: 2 },
    { id: "auth", name: "Auth", status: "operational", reason: "Sign-ins completing", checkedMinutesAgo: 3 },
    { id: "billing", name: "Billing", status: "degraded", reason: "Stripe webhook delay", checkedMinutesAgo: 4 },
    { id: "site", name: "chlkapp.com", status: "operational", reason: "Site up · 200 from Dallas", checkedMinutesAgo: 2, href: SITE_HREF },
    { id: "export", name: "Export", status: "operational", reason: "Exports finishing", checkedMinutesAgo: 6 },
    { id: "sentry", name: "Sentry errors (24h)", status: "operational", reason: "3 errors · nothing new", checkedMinutesAgo: 5, href: SENTRY_HREF },
  ],
}

/** How far back the mock's one past incident sits (18 Aug against a 7 Oct "today"). */
const PAST_INCIDENT_DAYS_AGO = 50

/** The rows for a scenario, with every check dated against `nowMs`. */
export function buildServices(nowMs: number, scenario: Scenario = DEFAULT_SCENARIO): Service[] {
  return SEED[scenario].map(({ checkedMinutesAgo, ...row }) => ({
    ...row,
    checkedAtMs: nowMs - checkedMinutesAgo * 60_000,
  }))
}

/** The mock's one resolved incident, dated relative to the Central day of `nowMs`. */
export function buildPastIncident(nowMs: number): PastIncident {
  return {
    summary: "Resolved · Sync delay after the iPad 1.4 push. Cleared in 41 min. No open incident.",
    day: addDays(todayIn(new Date(nowMs)), -PAST_INCIDENT_DAYS_AGO),
  }
}

/* --------------------------------------------------------------- verdict */

export type Verdict = {
  green: boolean
  /** "All systems green" / "Not green". */
  title: string
  /** The one-line reason under the title. */
  detail: string
  /** Whether anything is red; drives the banner's tone. */
  anyDown: boolean
  counts: Record<ServiceStatus, number>
  /** The most recent check, as an instant. */
  updatedAtMs: number
}

export const VERDICT_GREEN = "All systems green"
export const VERDICT_NOT_GREEN = "Not green"

export function countByStatus(services: readonly Service[]): Record<ServiceStatus, number> {
  const counts: Record<ServiceStatus, number> = { operational: 0, degraded: 0, down: 0 }
  for (const s of services) counts[s.status] += 1
  return counts
}

/** A list of names: "Billing", "Billing and Sync", "Billing, Sync and Auth". */
export function joinNames(names: readonly string[]) {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * Green only when *every* row is operational. One degraded row, or one
 * down row, makes the whole page not green — there is no "mostly up".
 */
export function verdictFor(services: readonly Service[]): Verdict {
  const counts = countByStatus(services)
  const notGreen = services.filter((s) => s.status !== "operational")
  const down = notGreen.filter((s) => s.status === "down")
  const degraded = notGreen.filter((s) => s.status === "degraded")
  const green = notGreen.length === 0
  const updatedAtMs = services.reduce((max, s) => Math.max(max, s.checkedAtMs), Number.NEGATIVE_INFINITY)

  let detail: string
  if (services.length === 0) {
    detail = "Nothing is being checked yet."
  } else if (green) {
    detail = "Every check passed. Nothing needs you."
  } else {
    const clauses: string[] = []
    if (down.length > 0) {
      clauses.push(`${joinNames(down.map((s) => s.name))} ${down.length === 1 ? "is" : "are"} down · ${down.map((s) => s.reason).join("; ")}.`)
    }
    if (degraded.length > 0) {
      clauses.push(`${joinNames(degraded.map((s) => s.name))} ${degraded.length === 1 ? "is" : "are"} degraded · ${degraded.map((s) => s.reason).join("; ")}.`)
    }
    if (counts.operational > 0) clauses.push("Other systems operational.")
    detail = clauses.join(" ")
  }

  return {
    green,
    title: green ? VERDICT_GREEN : VERDICT_NOT_GREEN,
    detail,
    anyDown: down.length > 0,
    counts,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : Number.NaN,
  }
}

/** "7 operational", "6 operational · 1 degraded", "5 operational · 1 degraded · 1 down". */
export function formatCounts(counts: Record<ServiceStatus, number>) {
  const parts = [
    `${counts.operational} operational`,
    counts.degraded > 0 ? `${counts.degraded} degraded` : null,
    counts.down > 0 ? `${counts.down} down` : null,
  ]
  return parts.filter((p): p is string => p !== null).join(" · ")
}

/** "None down" / "1 down" / "2 down" — the Components block's right-hand label. */
export function formatDownCount(counts: Record<ServiceStatus, number>) {
  return counts.down === 0 ? "None down" : `${counts.down} down`
}

/* -------------------------------------------------------------- display */

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
}

// Built on first use, not at import: Intl.DateTimeFormat is costly and a
// server bundle that never formats a time should not pay for it. (Relative
// time itself is the shared `formatRelative` in `@/lib/clock`.)
let centralClock: Intl.DateTimeFormat | undefined

/** "9:14 AM CT" — the wall-clock time where the founder is, whatever zone the machine is in. */
export function formatCentralTime(atMs: number) {
  centralClock ??= new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    hour: "numeric",
    minute: "2-digit",
  })
  // Intl uses a narrow no-break space before AM/PM in newer ICU; normalise.
  return `${centralClock.format(atMs).replace(/\u202f/g, " ")} CT`
}

/**
 * How long ago a check ran, in the shared formatter's verbose style —
 * asked for explicitly, so this page does not move if the default does.
 */
export function formatCheckedAgo(atMs: number, nowMs: number) {
  return formatRelative(atMs, nowMs, { style: "long" })
}

/** "Checked 2 min ago · 9:14 AM CT" */
export function formatChecked(atMs: number, nowMs: number) {
  return `Checked ${formatCheckedAgo(atMs, nowMs)} · ${formatCentralTime(atMs)}`
}
