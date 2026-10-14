# Live Stripe (read-only)

Home, Metrics and Settings read live figures from Stripe. Everything else on
the dashboard is still sample data, labelled.

## Setup

| | |
| --- | --- |
| Env var | `STRIPE_READONLY_KEY` — **server only**, never `NEXT_PUBLIC_`. |
| Key | A Stripe **restricted** key (`rk_live_…`) with read access to Subscriptions, Invoices, Charges and Coupons. The server refuses anything that is not `rk_…`/`sk_…`. |
| Calls | `subscriptions.list` (all statuses, discounts expanded), `invoices.list` (`status=paid`, every page, listed once and joined on `parent.subscription_details.subscription` — never one call per subscription) and `charges.list` (last 15 days), via the official `stripe` package (pinned). List calls only. A full sync takes a few minutes at ~3k subscriptions; the routes allow 300 s. |
| Cache | One sync per server process every 5 minutes; a failed sync retries after 1 minute. The last good copy is kept. |

Optional, local only: `STRIPE_API_BASE=http://127.0.0.1:<port>` points the SDK
at a loopback mock. It is ignored in a production build unless
`STRIPE_ALLOW_MOCK_BASE=1`, and any non-loopback host disables Stripe
entirely, so a key can never be sent somewhere else.

## Endpoints

- `GET /api/stripe/summary?tz=<zone>` → `{ status, lastSyncedAt, metrics }`.
  `status` is `connected` (synced within 5 min), `stale` (Stripe failed; the
  last good figures and their `lastSyncedAt`), or `not_connected` (no key, or
  never synced; `metrics: null`). Never an error body, never made-up zeros.
- `GET /api/health/stripe` → `{"stripe":"ok"|"unavailable"|"not_configured"}`
  only. Same cache, safe to leave public.

## What each screen shows

| State | Stripe-fed tiles | Label |
| --- | --- | --- |
| Loading (first paint) | `–` placeholder | none |
| Connected | Stripe's figure | none |
| Stale | Stripe's last figure + "Last updated <time>" | none |
| Not connected | The sample figure, as before | Sample data |

Stripe feeds: the Home ticker and Subscribers card, Home's Cash this week,
the Home Metrics door (MRR series), and the Metrics MRR, Churn Rate, Trial
Conversions and Subscribers cards. Settings › Connected data shows Stripe as
Connected (with the last sync), Last updated (stale), or Not connected.
Times use the shared clock (`formatWallClock`) in the Settings time zone.

## Metric definitions

All in `src/lib/stripe-metrics.ts` (pure, unit-tested). USD only; other
currencies are skipped, not converted.

- **Subscribers (paying)** — Bobbi's definition (Data, Oct 14 2026): a
  Stripe subscription that has **not ended** (any status except `canceled`
  and `incomplete_expired`, so `past_due` counts) and has **paid at least
  one invoice with `amount_paid > 0`**. There is no "has a coupon now"
  filter: a subscription that paid once and now sits on a 100% coupon
  counts; one that never paid (e.g. a 100%-off launch annual) does not,
  whatever its status. App Store payers are not in Stripe and are not
  counted. This matched Bobbi's **1,110** on real Stripe at ~8 AM CT on
  Oct 14 2026 (1,079 `active` + 31 `past_due`). Coulson's earlier 1,156
  (`status=active` minus subscriptions on a 100% coupon now) differs by
  −31 past_due, +84 never-paid active with no coupon now, −7 paid before
  and now on a 100% coupon; `src/lib/stripe-reconcile.test.ts` pins that
  bridge on a synthetic fixture. Past points count a subscription from
  its first paid invoice until it ended. Today's change is the count now
  minus the count at 00:00 in the Settings zone.
- **Cash this week** — gross amount of succeeded, captured charges since
  Monday 00:00 in the Settings zone. Refunds and fees are not netted out.
  Compared with last week from Monday to the same point in the week.
- **MRR** — over the **same paying set as Subscribers**, USD only: for each
  paying subscription, Σ unit amount × quantity per item,
  normalized to a month (year ÷ 12, week × 52/12, day × 365/12, divided by
  `interval_count`), less live percent-off / amount-off discounts (`once`
  coupons ignored, never below 0). Metered and tiered prices count as 0.
  Past points use today's prices (Stripe keeps no price history).
- **Churn** — of the subscriptions active (`active`/`past_due`, past the
  trial; unchanged by the paying definition) at the start of the 28-day window,
  the share that ended inside it (cancelled or dropped for failed payment).
  Ones that start and end inside the window are not counted. No base → no
  figure (`—`), not 0%.
- **Trial-to-paid** — of the trials that ended in the 28-day window (or were
  cancelled during it), the share that converted: `active` now, or ran past
  the trial and was later cancelled by the customer (not for a failed
  payment). `past_due` after the trial is not yet converted. No trials → `—`.

Historical points (series, "previous") are reconstructed from timestamps
(`first_paid_at` from the paid invoices, `start_date`, `trial_end`,
`ended_at`) because Stripe keeps no status
history; they are best effort.

## Checks

- `pnpm check:bundle` (CI, after `pnpm build` with a dummy key) scans
  `.next/static` and prerendered output for the key's value and for the
  string `STRIPE_READONLY_KEY`, and fails if either is there.
- CI runs the app with no key; Playwright mocks `/api/stripe/summary` in the
  browser for the connected and stale states. CI never calls Stripe.
