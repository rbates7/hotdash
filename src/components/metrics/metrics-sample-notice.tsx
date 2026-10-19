"use client"

import { usePosthogFeed } from "@/hooks/use-posthog-summary"
import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { isSuspectAppStore } from "@/lib/app-store-summary"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"

export const PARTLY_LIVE_LABEL = "Partly live"
/** The notice's label while Stripe's first sync runs and nothing is live yet. */
export const CONNECTING_LABEL = "Connecting"
/** Stripe has a key and its first sync is still running. */
export const STRIPE_CONNECTING_TEXT =
  "Stripe\u2019s first sync is in progress; MRR, Churn Rate, Trial Conversions and Subscribers will appear when it finishes"
/** The same, inside the "Partly live" notice (PostHog live, Stripe connecting). */
export const STRIPE_CARDS_CONNECTING_TEXT =
  "the Stripe cards (MRR, Churn Rate, Trial Conversions and Subscribers) are connecting and will appear when Stripe\u2019s first sync finishes"
/** Stripe is live, Chlk's database (App Store payers) is still on its first read. */
export const APP_STORE_CONNECTING_NOTE = "Subscribers waits for App Store payers from Chlk’s database, first read in progress"

/**
 * The Metrics notice, honest about what is live: with Stripe feeding the
 * MRR, Churn Rate, Trial Conversions and Subscribers cards, and/or PostHog
 * feeding Retention and Active Users, it leads with "Partly live", says
 * which cards from where, and that the rest is still illustrative.
 * Subscribers also counts App Store payers when Chlk's database answers
 * — but not when it answers 0 (suspect: a blocked read), which it says.
 * While Stripe (or the App Store count) is still on its first read it says
 * so ("connecting"), never "nothing is connected".
 */
export function MetricsSampleNotice() {
  const stripe = useStripeFeed()
  const posthog = usePosthogFeed()
  const fromStripe = stripe.kind === "live"
  const fromPosthog = posthog.kind === "live"
  // A key is set and the first sync is running: not "nothing is connected".
  const stripeConnecting = stripe.kind === "loading" && Boolean(stripe.connecting)
  if (!fromStripe && !fromPosthog) {
    if (!stripeConnecting) return <SampleDataNotice />
    return (
      <SampleDataNotice label={CONNECTING_LABEL}>
        {STRIPE_CONNECTING_TEXT}. Every other number on this page is illustrative — PostHog is not connected yet,
        and the expenses you enter live in this browser.
      </SampleDataNotice>
    )
  }
  const suspect = fromStripe && isSuspectAppStore(stripe.appStore)
  // Counted only once it has answered: not while connecting, and not a suspect 0.
  const appStore =
    fromStripe && (stripe.appStore.status === "connected" || stripe.appStore.status === "stale") && !suspect
  const appStoreConnecting = fromStripe && stripe.appStore.status === "connecting"
  const rest = fromStripe
    ? fromPosthog
      ? appStore
        ? "Supabase is connected only for that count"
        : appStoreConnecting
          ? "Supabase is connecting only for that count"
          : "Supabase is not connected yet"
      : appStore
        ? "PostHog is not connected yet, and Supabase only for that count"
        : appStoreConnecting
          ? "PostHog is not connected yet, and Supabase is connecting only for that count"
          : "Supabase and PostHog are not connected yet"
    : stripeConnecting
      ? "Supabase is not connected yet beyond the App Store count"
      : "Stripe and Supabase are not connected yet"
  return (
    <SampleDataNotice label={PARTLY_LIVE_LABEL}>
      {fromStripe && (
        <>
          MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe (read-only)
          {stripe.stale ? ", as of their last update" : ""}
          {appStore ? "; Subscribers also counts App Store payers from Chlk’s database (read-only)" : ""}
          {appStoreConnecting ? `; ${APP_STORE_CONNECTING_NOTE}` : ""}
          {suspect ? "; Subscribers leaves out App Store payers until Chlk’s database read is checked (it read 0)" : ""}
        </>
      )}
      {fromStripe && fromPosthog && "; "}
      {fromPosthog && (
        <>
          Retention and Active Users are live from PostHog (read-only, iOS app events only)
          {posthog.stale ? ", as of their last update" : ""}
        </>
      )}
      {stripeConnecting && `; ${STRIPE_CARDS_CONNECTING_TEXT}`}
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
  // Connecting: the Stripe cards are placeholders, not sample, so the page is not all sample either.
  if (stripe.kind === "live" || posthog.kind === "live") return null
  if (stripe.kind === "loading" && stripe.connecting) return null
  return <SampleDataTag className={className} />
}
