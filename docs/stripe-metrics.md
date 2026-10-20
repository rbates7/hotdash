# Stripe metrics: definitions (Oct 20, 2026)

What `/api/stripe/summary` (`metrics`) and `/api/stripe/subscribers` return,
and how each figure is worked out. Code: `src/lib/stripe-metrics.ts`,
`src/lib/stripe-subscribers.ts`, `src/lib/server/stripe-subscribers.ts`.
Money is in US dollars. Other currencies are skipped. A rate is a % with one
decimal, and `null` means there was nothing to divide by.

## Active only (replaces the Oct 14 definition)
Rashad, via Coulson, Oct 20: only subscriptions with status `active` count.
- **subscribers**: `active` and has paid at least one invoice with an amount > 0.
- **mrr** and its history count only those subscribers.
- **churn base**: subscriptions active at the start of the window.
- **pastDue `{ value, mrr }`**: subscriptions that have paid before and are
  `past_due` now (a renewal is failing and Stripe is retrying), with their
  monthly-equivalent revenue at risk. This figure is separate and is in neither
  subscribers nor MRR. It has no history, because Stripe can't date a past-due spell.
- On the Oct 14 reconciliation fixture: subscribers go from 1,110 to 1,079
  (31 past due), and the Subscribers total from 1,337 to 1,306.

## New summary figures
| Field | Shape | Formula |
|---|---|---|
| `arr` | `{ value, previous, series[6] }` | `mrr × 12` at the same points |
| `revenue` | `{ value, previous, series[6], invoices }` | Sum of `amount_paid` of paid invoices whose paid time (`status_transitions.paid_at`, else `created`) falls in each 28-day window. The current window runs to now. `invoices` = how many are in the current window. Gross: refunds are not taken off. |
| `arpu` | `{ value, previous }` (number or null) | `mrr ÷ subscribers` (Stripe paying, active only), to the cent. null if there are none. `previous` is at the start of the current window. |
| `ltv` | `{ value, previous }` (number or null) | `arpu ÷ monthly churn`, where monthly churn = `churn% / 100 × 30.44 / 28` (the 28-day rate scaled to an average month). null if churn is 0 or unknown. |
| `nrr` | `{ value, previous, series[6], basis: "current_prices" }` | Take the subscriptions paying at a window's start. NRR = their MRR at its end (0 if ended) ÷ their MRR at its start × 100. |
| `trialsStartedPerDay` | `{ series: {date, count}[28], total, previousTotal }` | Subscriptions whose `trial_start` falls on each day (founder's time zone) of the last 28 days, oldest first, whatever happened to the trial since. `previousTotal` = the 28 days before. |

**NRR basis.** Stripe keeps no price history, so both ends of NRR use
today's prices. Only churn, quantity changes and discounts starting or
ending move it, not price changes. The response says so in `nrr.basis:
"current_prices"`, and the card should show a note such as "At today's prices".

## New and Churned Subscribers lists
`GET /api/stripe/subscribers?list=new|churned&tz=<zone>`
- The dashboard login protects it (401 when logged out). A missing or unknown `list` is 400 `{ "error": "bad_list" }`.
- **new**: first paid invoice inside the current 28-day window (active now, or since canceled).
- **churned**: active at the window's start and ended since. `total` equals `metrics.churn.churned`.
- Rows are newest first, at most 100. `total` is the full count.
- Row: `subscriptionId, customerName, customerEmail, plan (price nickname), interval, mrr, at (ISO), reason (churned only)`.
- Names and emails are looked up from Stripe customers on the server only,
  with one read-only `customers.retrieve` per row. The sync itself keeps only the customer id.
- Each list is cached for 2 minutes per list and time zone, and each customer for 2 minutes. The browser gets `no-store`.
- Names, emails and customer ids are never logged. A failed lookup logs one
  word (the error type) and leaves the name and email null.
- Status words as everywhere: `connected | stale | connecting | not_connected`. Without a sync, the list is empty.
