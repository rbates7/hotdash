import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { livePosthogSummary, setPosthogSummaryForTest } from "@/test/posthog"
import { LIVE_METRICS, liveSummary, setStripeSummaryForTest } from "@/test/stripe"
import { APP_STORE_ZERO } from "@/test/stripe-fixture"
import { MetricsSampleNotice, PARTLY_LIVE_LABEL } from "@/components/metrics/metrics-sample-notice"

/**
 * The combined Metrics notice after #44 (PostHog) met #48 (App Store suspect
 * zero): each behaviour alone, and both together. Not connected is the
 * default for every feed (src/test/setup.ts).
 */

const POSTHOG_LINE = "Retention and Active Users are live from PostHog (read-only, iOS app events only)"
const SUSPECT_LINE = "Subscribers leaves out App Store payers until Chlk’s database read is checked (it read 0)"
const STRIPE_LINE = "MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe (read-only)"
const APP_STORE_COUNTED = "Subscribers also counts App Store payers"

function noticeText() {
  render(<MetricsSampleNotice />)
  return document.body.textContent ?? ""
}

describe("Metrics notice: PostHog live + App Store suspect 0", () => {
  it("says Partly live with both the PostHog wording and the suspect-zero line", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_ZERO))
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    const text = noticeText()
    expect(screen.getByRole("note", { name: PARTLY_LIVE_LABEL })).toBeInTheDocument()
    expect(text).toContain(STRIPE_LINE)
    expect(text).toContain(SUSPECT_LINE)
    expect(text).toContain(POSTHOG_LINE)
    expect(text).not.toContain(APP_STORE_COUNTED)
    expect(text).toContain("Supabase is not connected yet")
  })

  it("PostHog live only: PostHog wording, no Stripe or suspect line", () => {
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    const text = noticeText()
    expect(screen.getByRole("note", { name: PARTLY_LIVE_LABEL })).toBeInTheDocument()
    expect(text).toContain(POSTHOG_LINE)
    expect(text).not.toContain(SUSPECT_LINE)
    expect(text).not.toContain(STRIPE_LINE)
    expect(text).toContain("Stripe and Supabase are not connected yet")
  })

  it("suspect zero only (PostHog not connected): suspect line, no PostHog wording", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_ZERO))
    const text = noticeText()
    expect(screen.getByRole("note", { name: PARTLY_LIVE_LABEL })).toBeInTheDocument()
    expect(text).toContain(SUSPECT_LINE)
    expect(text).not.toContain(POSTHOG_LINE)
    expect(text).not.toContain(APP_STORE_COUNTED)
    expect(text).toContain("Supabase and PostHog are not connected yet")
  })
})
