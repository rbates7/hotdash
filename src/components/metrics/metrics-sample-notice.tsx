"use client"

import { usePosthogFeed } from "@/hooks/use-posthog-summary"
import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"

export const PARTLY_LIVE_LABEL = "Partly live"

/**
 * The Metrics notice, honest about what is live: with Stripe feeding the
 * MRR, Churn Rate, Trial Conversions and Subscribers cards, and/or PostHog
 * feeding Retention and Active Users, it leads with "Partly live", says
 * which cards from where, and that the rest is still illustrative.
 * Subscribers also counts App Store payers when Chlk's database answers.
 */
export function MetricsSampleNotice() {
  const stripe = useStripeFeed()
  const posthog = usePosthogFeed()
  const fromStripe = stripe.kind === "live"
  const fromPosthog = posthog.kind === "live"
  if (!fromStripe && !fromPosthog) return <SampleDataNotice />
  const appStore = fromStripe && stripe.appStore.status !== "not_connected"
  const rest = fromStripe
    ? fromPosthog
      ? appStore
        ? "Supabase is connected only for that count"
        : "Supabase is not connected yet"
      : appStore
        ? "PostHog is not connected yet, and Supabase only for that count"
        : "Supabase and PostHog are not connected yet"
    : "Stripe and Supabase are not connected yet"
  return (
    <SampleDataNotice label={PARTLY_LIVE_LABEL}>
      {fromStripe && (
        <>
          MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe (read-only)
          {stripe.stale ? ", as of their last update" : ""}
          {appStore ? "; Subscribers also counts App Store payers from Chlk’s database (read-only)" : ""}
        </>
      )}
      {fromStripe && fromPosthog && "; "}
      {fromPosthog && (
        <>
          Retention and Active Users are live from PostHog (read-only, iOS app events only)
          {posthog.stale ? ", as of their last update" : ""}
        </>
      )}
      . Every other number on this page is illustrative — {rest}, and the expenses you enter live in this
      browser.
    </SampleDataNotice>
  )
}

/**
 * The page-level Sample chip in the Metrics header. With Stripe or PostHog
 * live the page is not all sample, so the chip goes: the notice says
 * "Partly live" and every sample card keeps its own chip.
 */
export function MetricsHeaderSampleTag({ className }: { className?: string }) {
  const stripe = useStripeFeed()
  const posthog = usePosthogFeed()
  if (stripe.kind === "live" || posthog.kind === "live") return null
  return <SampleDataTag className={className} />
}
