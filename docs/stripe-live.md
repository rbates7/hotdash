# Live Stripe (read-only) and App Store payers

Home, Metrics and Settings read live figures from Stripe, and the
Subscribers total also counts App Store payers read from Chlk's Supabase
Postgres. Everything else on the dashboard is still sample data, labelled.

## Setup

| | |
| --- | --- |
| Env vars | `STRIPE_READONLY_KEY` and `SUPABASE_READONLY_DB_URL` — **server only**, never `NEXT_PUBLIC_`. Either can be missing: that source is then "not connected". |
| Database URL | `SUPABASE_READONLY_DB_URL`: a `postgres://`/`postgresql://` URL for a **read-only role** with `SELECT` on `chlk.subscriptions` and `chlk.plans` only (see [Read-only database role](#read-only-database-role)). Schema owner: **Radcliffe**. Always over **TLS**: with no `sslmode`, or one that allows plaintext (`disable`/`allow`/`prefer`), the server uses `sslmode=require`, and passes `ssl: "require"` to the client too (`verify-ca`/`verify-full` are kept). |
| Key | A Stripe **restricted** key (`rk_live_…`) with read access to Subscriptions, Invoices, Charges and Coupons. The server refuses anything that is not `rk_…`/`sk_…`. |
| Calls | `subscriptions.list` (all statuses, discounts expanded), `invoices.list` (`status=paid`, every page, listed once and joined on `parent.subscription_details.subscription` — never one call per subscription) and `charges.list` (last 15 days), via the official `stripe` package (pinned). List calls only. A full sync takes a few minutes at ~3k subscriptions; it is cut off at 240 s (the routes allow 300 s). |
| Cache | One sync per server process every 5 minutes, always **in the background**: a request never waits for it. It gets the last good copy (`connected`, or `stale` after a failure) while a due sync runs behind it, one at a time; on a cold start with no copy yet it gets `not_connected` at once (the dashboard shows its labelled sample figures) and the next poll, a minute later, picks up the sync once it lands. The routes hand the running sync to `after()` so it outlives the response. A sync over 240 s is a failure; a failed sync retries 1 minute after it failed. The last good copy is kept. |
| App Store read | `src/lib/server/app-store.ts`, via the `postgres` package (pinned): one short-lived connection per count (`max: 1`, `prepare: false` for Supabase's pooler), a `begin read only` transaction with `set local statement_timeout = 10000`, then the fixed query below. Same background refresh (never awaited by a request; `not_connected` until the first count lands), 240 s limit, 5-minute cache, 1-minute retry and last good count. Any failure is `stale` (with a last good count) or `not_connected` — never a throw, never held up with Stripe's sync, never a made-up 0. Logs only the error's class name. |

Optional, local only: `STRIPE_API_BASE=http://127.0.0.1:<port>` points the SDK
at a loopback mock. It is ignored in a production build unless
`STRIPE_ALLOW_MOCK_BASE=1`, and any non-loopback host disables Stripe
entirely, so a key can never be sent somewhere else.

### Read-only database role

`SUPABASE_READONLY_DB_URL` connects as a role that can only read the two
tables the App Store count uses. **Owner: Radcliffe**, who creates it and
sets the password; it has not been run from here, and nobody else should
run it.

```sql
create role hotdash_readonly login password '<set by Radcliffe>';
grant usage on schema chlk to hotdash_readonly;
grant select on chlk.subscriptions, chlk.plans to hotdash_readonly;
alter role hotdash_readonly set default_transaction_read_only = on;
```

No other grants: no `insert`/`update`/`delete`, nothing outside `chlk`,
no other `chlk` table. `default_transaction_read_only` is a second guard
behind the server's own `begin read only` transaction.

## Endpoints

- `GET /api/stripe/summary?tz=<zone>` → `{ status, lastSyncedAt, metrics, appStore }`.
  `status` is `connected` (synced within 5 min), `stale` (Stripe failed; the
  last good figures and their `lastSyncedAt`), or `not_connected` (no key, or
  no sync has landed yet — including the first few minutes after a cold
  start; `metrics: null`). `appStore` is its own source:
  `{ status: "connected" | "stale", count, asOf }` or
  `{ status: "not_connected" }`. The two are read side by side and fail
  independently. Never an error body, never made-up zeros.
- `GET /api/health/stripe` → `{"stripe":"ok"|"unavailable"|"not_configured"}`
  only. Same cache, safe to leave public.

## What each screen shows

| State | Stripe-fed tiles | Label |
| --- | --- | --- |
| Loading (first paint) | `–` placeholder | none |
| Connected | Stripe's figure | none |
| Stale | Stripe's last figure + "Last updated <time>" | none |
| Not connected | The sample figure, as before | Sample data |

With Stripe not connected, the App Store count is not shown either: the
Subscribers surfaces stay sample, as before.

Stripe feeds: the Home ticker and Subscribers card, Home's Cash this week,
the Home Metrics door (MRR series), and the Metrics MRR, Churn Rate, Trial
Conversions and Subscribers cards. Settings › Connected data shows Stripe as
Connected (with the last sync), Last updated (stale), or Not connected.
Times use the shared clock (`formatWallClock`) in the Settings time zone.

## Metric definitions

All in `src/lib/stripe-metrics.ts` (pure, unit-tested). USD only; other
currencies are skipped, not converted.

- **Subscribers** — Rashad + Bobbi's final definition (Data, Oct 14 2026).
  The Home card, the ticker and Metrics › Subscribers all show the
  **total** = (1) + (2) + (3), with the three groups listed under it (the
  ticker: as a tooltip on hover/keyboard focus and as the link's
  accessible description; its live region announces the total only).
  Old Oct 14 figure: **1,337 = 1,110 + 53 + 174** (the e2e and unit mocks
  still reuse these Oct 14 figures).
  1. **Stripe paying** (`isPaying`) — status `active` or `past_due` **and**
     at least one paid invoice with `amount_paid > 0`. `trialing`, `unpaid`
     and `paused` do not count, even with paid history. No "has a coupon
     now" filter: a subscription that paid once and now sits on a 100%
     coupon counts. 1,110 on Oct 14 (1,079 `active` + 31 `past_due`).
  2. **App Store payers** — Rashad + Bobbi's definition, with the status
     filter tightened to `active` only for #47 (not `trialing`, `past_due`
     or `billing_retry`): Chlk users paying through Apple, with no
     active, past-due or trialing Stripe or invoice subscription (overlap
     with Stripe was 0 on Oct 14). Counted in Chlk's database with exactly
     this query (verified read-only on prod: **51 on Oct 16 2026, 10:30 PM
     CT**, active-only; billing_retry adds 0; the count is live and moves). `apple_product_id` is on
     `chlk.plans`, not `chlk.subscriptions`; `method` is one of
     `AppStore`, `Stripe`, `invoice`.

     ```sql
     select count(distinct a.user_id)::int as n
     from chlk.subscriptions a
     join chlk.plans p on p.id = a.plan_id
     where a.method = 'AppStore'
       and p.apple_product_id is not null
       and a.subscription_status = 'active'
       and not exists (
         select 1 from chlk.subscriptions x
         where x.user_id = a.user_id
           and x.method in ('Stripe','invoice')
           and x.subscription_status in ('active','past_due','trialing')
       )
     ```

     Invoice (school/district) coaches are **not** in the total (Rashad,
     Oct 16): Subscribers = Stripe paying + App Store + free. Earlier Oct
     16 snapshot: 1,324 = 1,102 + 53 + 169 (live figures move; App Store
     read 51 at 10:30 PM CT).

     Only in the total when that source has answered. Not connected → the
     App Store row reads "Not connected" and the total says **"Total
     excludes App Store (not connected)"**; it is never counted as 0.
     Stale → its last good count, with "App Store as of <time>".
  3. **Free accounts** (`isFreeAccount`, labelled **"Free (never paid)"**
     in the breakdown) — Stripe status exactly `active`
     and **never** paid an invoice with `amount_paid > 0`, coupon on it now
     or not (100%-off launch annuals, and ones whose coupon has dropped off
     but have not been charged yet). Never-paid `trialing` and `past_due`
     are in no group. 174 on Oct 14.

  **History** (previous, today, the six-window series): (1) counts a
  subscription from its first paid invoice until it ended (`payingAt`);
  ones sitting in `unpaid`/`paused`/`trialing` now cannot be dated and are
  in no point. (3) counts an account from the end of any trial until it
  first paid (then it is in (1)) or ended (`freeAt`); one dropped for a
  failed payment was past due, not free, and is left out. (2) has **no
  history** — the query is a count now — so the App Store count is held at
  its current value at every past point. The line sits at the right level,
  and the delta and "today" are the change in (1) + (3) alone, not a jump
  the size of the App Store count on the day it connected. Today's change
  is the count now minus the count at 00:00 in the Settings zone.

  Coulson's earlier 1,156 (`status=active` minus subscriptions on a 100%
  coupon now) differs from (1) by −31 past_due, +84 never-paid active with
  no coupon now, −7 paid before and now on a 100% coupon.
  `src/lib/stripe-reconcile.test.ts` pins that bridge and the 1,337 total
  (App Store from a mocked provider) on a synthetic fixture.
- **Cash this week** — gross amount of succeeded, captured charges since
  Monday 00:00 in the Settings zone. Refunds and fees are not netted out.
  Compared with last week from Monday to the same point in the week.
- **MRR** — over the **Stripe paying set (1) only** (not free accounts,
  not App Store), USD only: for each
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

- `pnpm check:bundle` (CI, after `pnpm build` with a dummy key and a dummy
  database URL) scans `.next/static` and prerendered output for each value
  and for the strings `STRIPE_READONLY_KEY` and `SUPABASE_READONLY_DB_URL`,
  and fails if any is there.
- CI and Playwright run the app with both blank; Playwright mocks
  `/api/stripe/summary` in the browser for the connected and stale states,
  with the App Store connected and not connected. CI never calls Stripe or
  the database. Unit tests swap the App Store provider
  (`createAppStoreSource({ query })`, `setAppStoreSource`) and fake the
  `postgres` client to check the exact SQL and the read-only transaction.
