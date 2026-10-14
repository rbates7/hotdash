"use client"

import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"

export const PARTLY_LIVE_LABEL = "Partly live"

/**
 * The Metrics notice, honest about what is live: with Stripe feeding the
 * MRR, Churn Rate, Trial Conversions and Subscribers cards it leads with
 * "Partly live", says which cards, and that the rest is still illustrative.
 */
export function MetricsSampleNotice() {
  const feed = useStripeFeed()
  if (feed.kind !== "live") return <SampleDataNotice />
  return (
    <SampleDataNotice label={PARTLY_LIVE_LABEL}>
      MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe (read-only)
      {feed.stale ? ", as of their last update" : ""}. Every other number on this page is
      illustrative — Supabase and PostHog are not connected yet, and the expenses you enter live in
      this browser.
    </SampleDataNotice>
  )
}

/**
 * The page-level Sample chip in the Metrics header. With Stripe live the
 * page is not all sample, so the chip goes: the notice says "Partly live"
 * and every sample card keeps its own chip.
 */
export function MetricsHeaderSampleTag({ className }: { className?: string }) {
  const feed = useStripeFeed()
  if (feed.kind === "live") return null
  return <SampleDataTag className={className} />
}
