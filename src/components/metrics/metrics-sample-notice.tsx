"use client"

import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { SampleDataNotice } from "@/components/sample-data"

/**
 * The Metrics notice, honest about what is live: with Stripe feeding the
 * MRR, Churn Rate, Trial Conversions and Subscribers cards it says so, and
 * that the rest is still illustrative.
 */
export function MetricsSampleNotice() {
  const feed = useStripeFeed()
  if (feed.kind !== "live") return <SampleDataNotice />
  return (
    <SampleDataNotice>
      MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe (read-only)
      {feed.stale ? ", as of their last update" : ""}. Every other number on this page is
      illustrative — Supabase and PostHog are not connected yet, and the expenses you enter live in
      this browser.
    </SampleDataNotice>
  )
}
