"use client"

import { PlugZapIcon } from "lucide-react"

import { usePosthogFeed } from "@/hooks/use-posthog-summary"
import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { isSuspectAppStore } from "@/lib/app-store-summary"
import { cn } from "@/lib/utils"

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

export const NOT_CONNECTED_LABEL = "Not connected"

/** Every Metrics card with no live source, in the notice's words. */
export const OTHER_CARDS_TEXT =
  "Every other card says Not connected until its source is wired up; none shows an invented figure"

/**
 * The notice's frame: neutral (not the amber sample surface, since nothing
 * on the page is sample any more), readable in both themes.
 */
function ConnectionNotice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="note"
      aria-label={label}
      data-testid="metrics-connection-notice"
      className={cn(
        "text-body bg-surface border-surface-border text-foreground flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5"
      )}
    >
      <PlugZapIcon className="text-muted-foreground mt-0.5 size-4 flex-none" aria-hidden />
      <p>
        <strong className="font-semibold">{label}.</strong> {children}
      </p>
    </div>
  )
}

/**
 * The Metrics notice, honest about what is live: with Stripe feeding the
 * MRR, Churn Rate, Trial Conversions and Subscribers cards, and/or PostHog
 * feeding Retention and Active Users, it leads with "Partly live" and says
 * which cards from where. Every other card is Not connected (no figure).
 * Subscribers also counts App Store payers when Chlk's database answers
 * — but not when it answers 0 (suspect: a blocked read), which it says.
 * While Stripe (or the App Store count) is still on its first read it says
 * so ("Connecting"), never "nothing is connected".
 */
export function MetricsSampleNotice() {
  const stripe = useStripeFeed()
  const posthog = usePosthogFeed()
  const fromStripe = stripe.kind === "live"
  const fromPosthog = posthog.kind === "live"
  // A key is set and the first sync is running: not "nothing is connected".
  const stripeConnecting = stripe.kind === "loading" && Boolean(stripe.connecting)
  if (!fromStripe && !fromPosthog) {
    if (!stripeConnecting) {
      return (
        <ConnectionNotice label={NOT_CONNECTED_LABEL}>
          Stripe, PostHog and Chlk&rsquo;s database are not connected yet, so no card has a figure. Only the cards
          you add or remove and the expenses you enter are yours, and those live in this browser.
        </ConnectionNotice>
      )
    }
    return (
      <ConnectionNotice label={CONNECTING_LABEL}>
        {STRIPE_CONNECTING_TEXT}. PostHog is not connected yet. {OTHER_CARDS_TEXT}; the expenses you enter live in
        this browser.
      </ConnectionNotice>
    )
  }
  const suspect = fromStripe && isSuspectAppStore(stripe.appStore)
  // Counted only once it has answered: not while connecting, and not a suspect 0.
  const appStore =
    fromStripe && (stripe.appStore.status === "connected" || stripe.appStore.status === "stale") && !suspect
  const appStoreConnecting = fromStripe && stripe.appStore.status === "connecting"
  return (
    <ConnectionNotice label={PARTLY_LIVE_LABEL}>
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
      {stripeConnecting && `; ${STRIPE_CARDS_CONNECTING_TEXT}`}. {OTHER_CARDS_TEXT}; the expenses you enter live in
      this browser.
    </ConnectionNotice>
  )
}
