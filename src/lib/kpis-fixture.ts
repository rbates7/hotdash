import { addDays, type IsoDay } from "@/lib/clock"
import type { ChurnedSubscriber, NewSubscriber } from "@/lib/metrics"

/**
 * The invented people behind the Metrics window's counts
 * (`SAMPLE_NEW_SUBSCRIBERS`, `SAMPLE_CHURNED_SUBSCRIBERS` in `@/lib/kpis`),
 * for tests only: the browser bundle ships the counts, never these names.
 */

/** Eight sign-ups, newest first, all inside the period. */
export function seedNewSubscribers(today: IsoDay | Date): NewSubscriber[] {
  const d = (offset: number) => addDays(today, offset)
  return [
    { id: "ns-1", name: "Alisha Patel", email: "apatel@example.com", plan: "Monthly", signupDate: d(-3) },
    { id: "ns-2", name: "Jamal Reeves", email: "jreeves@example.com", plan: "Staff", signupDate: d(-10) },
    { id: "ns-3", name: "Priya Shah", email: "priya.shah@example.org", plan: "Annual", signupDate: d(-15) },
    { id: "ns-4", name: "Marcus Hale", email: "mhale@example.org", plan: "Annual", signupDate: d(-18) },
    { id: "ns-5", name: "Colin Brooks", email: "cbrooks@example.com", plan: "Monthly", signupDate: d(-21) },
    { id: "ns-6", name: "Denise Okonkwo", email: "denise.o@example.com", plan: "Monthly", signupDate: d(-24) },
    { id: "ns-7", name: "Elena Vasquez", email: "elena.v@example.org", plan: "Annual", signupDate: d(-26) },
    { id: "ns-8", name: "Troy Nguyen", email: "troy.nguyen@example.org", plan: "Annual", signupDate: d(-27) },
  ]
}

/** Five churns inside the period; their sign-ups are months earlier, as churn is. */
export function seedChurnedSubscribers(today: IsoDay | Date): ChurnedSubscriber[] {
  const d = (offset: number) => addDays(today, offset)
  return [
    { id: "cs-1", name: "Brett Holloway", email: "b.holloway@example.org", signupDate: d(-221), churnDate: d(-13), lifetimeValue: 199 },
    { id: "cs-2", name: "Nina Cho", email: "nina.cho@example.org", signupDate: d(-351), churnDate: d(-19), lifetimeValue: 398 },
    { id: "cs-3", name: "Derek Fontaine", email: "dfontaine@example.com", signupDate: d(-155), churnDate: d(-23), lifetimeValue: 79 },
    { id: "cs-4", name: "Tamara Ellis", email: "tellis@example.com", signupDate: d(-287), churnDate: d(-25), lifetimeValue: 199 },
    { id: "cs-5", name: "Omar Siddiqui", email: "omar.s@example.org", signupDate: d(-200), churnDate: d(-27), lifetimeValue: 398 },
  ]
}

