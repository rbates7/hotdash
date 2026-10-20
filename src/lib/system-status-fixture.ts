import { addDays, todayIn } from "@/lib/clock"
import { SENTRY_HREF, SITE_HREF, type PastIncident, type Service } from "@/lib/system-status"

/**
 * Seeded System Status rows, for tests only: the app ships no sample
 * checks (Rashad's Oct 16 rule). Dated against `nowMs`.
 */

/** The scenarios: `empty` is the real zero-checks page; `green` / `not-green` are seeded views for unit tests only. */
export type Scenario = "green" | "not-green" | "empty"


/* ------------------------------------------------------------------ seed */

type SeedRow = Omit<Service, "checkedAtMs"> & { checkedMinutesAgo: number }

/**
 * The mock's component list, in its order, plus the Sentry row the brief
 * asks for ("Sentry and the site"). Every row carries a reason so the page
 * never shows a bare colour; the degraded Billing row is the only thing
 * the not-green scenario changes.
 */
const SEED: Record<Scenario, SeedRow[]> = {
  empty: [],
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
export function buildServices(nowMs: number, scenario: Scenario = "empty"): Service[] {
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
