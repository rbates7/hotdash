# Paying coaches tile

Home, **inside the KPI row** as its third card. It shows the number of
coaches with an **active** subscription, a breakdown by how they pay (App
Store, Stripe, invoice), and the total. Scope: Radcliffe via Simmons, Oct 19 2026.

| | |
|---|---|
| Route | `GET /api/subscriptions/paying`: server only, `no-store`, counts only (no names, ids or URL). Never an error body. `maxDuration` is 30 s (see below). |
| Access | Behind the #64 login gate like every `/api/*` route: **401** without the gate cookie when `DASHBOARD_LOGIN_EMAIL` and `DASHBOARD_GATE_SECRET` are set. Pinned by the opt-in `e2e/dashboard-gate.spec.ts` (throwaway values only). With the gate off, the route is public. |
| Public number | **Rashad, Oct 19 2026, 10:00 PM CT** (via Piper, relayed by Simmons): showing the paying-coaches number publicly is OK. The route is still **not** exempt from the gate; it is behind login like every other route, and #67 ships no earlier than the gate. |
| Source | Chlk's Supabase Postgres, `chlk.subscriptions` (schema owner: **Radcliffe**). |
| Setting | `SUPABASE_READONLY_DB_URL`: the **same** server-only, read-only URL the App Store count already uses (see [stripe-live.md](./stripe-live.md)). No new env var. Already covered by `scripts/check-client-bundle.mjs`. |
| Cache | One read per 5 minutes in the background, keeping the last good counts. Retry after 60 s on failure. Connect 10 s, statement 10 s, the whole read 20 s (`PAYING_SYNC_TIMEOUT_MS`). `read only` transaction, TLS required. |

## Query

```sql
select method, count(distinct user_id)::int as n
from chlk.subscriptions
where subscription_status = 'active'
group by method
union all
select '__total__', count(distinct user_id)::int
from chlk.subscriptions
where subscription_status = 'active'
```

`method` values (verified read-only, Oct 19 2026): `AppStore`, `Stripe`,
`invoice`. Any other value goes in an **Other** row, shown only when it is
not zero.

**The rows can add up to more than the total.** Each row counts distinct
coaches *within that method*. The total counts distinct coaches *across all
methods*. A coach with active subscriptions under two methods is in both
rows but counted once in the total. The tile says so under the rows:
"Coaches with more than one method count in each row". On Oct 19 2026 there
was no overlap, so the rows matched the total, but that isn't guaranteed.

**No user_id:** `count(distinct user_id)` would skip rows with a NULL
`user_id`, such as an org-level invoice with no user. A read-only check on
Oct 19 2026 found **0** active rows with a NULL `user_id` for every method
(AppStore, Stripe and invoice), so these rows get no special handling. If
any ever appear, they won't be counted.

## Which statuses count

**`active` only** (`PAYING_STATUSES`, pinned by tests), until Radcliffe
answers on the other statuses. That means:

- `past_due` and grace / `billing_retry` are **not** counted,
- `trialing` is **not** counted,
- a subscription set to cancel at period end is still `active`, so it **is** counted.

**How this differs from Subscribers:** the Subscribers card in the same row
uses different rules (see [stripe-live.md](./stripe-live.md), "Subscribers").
- Its Stripe paying group counts `active` **or `past_due`** with at least one
  paid invoice.
- It adds App Store-only payers and free accounts.

So the two cards measure different things, and their figures will differ.

## Layout (#67; design sign-off pending: Simmons is confirming with Deke)

- **1024px and up:** three even columns. The rows on desktop match heights,
  and the methods stack as label and value rows.
- **Below 1024px:** the tile spans the full row. The methods sit inline under
  the total: "App Store 40 · Stripe 900 · Invoice 60".
- **Not connected** cards, including the KPI cards, are only as tall as
  their content: the badge, the dash and one muted line ("Connect the
  database to see this" here, "Connect Stripe to see this" on the Stripe
  cards). Loading and Connecting… cards keep their room. So when the answer
  is "connected" nothing moves, but when it is "not connected" the strip can
  shrink and the doors move up. It never grows and pushes them down.
- **Numbers:** tabular figures.

## States (#50)

| Status | Tile |
|---|---|
| `connected` | Total, three method rows, the overlap note. |
| `stale` | The same, with the last good counts and "Last updated …" (`lastUpdatedLabel`). |
| `connecting` | URL set, first read running: Connecting… badge, dashes. |
| `not_connected` | No URL, a bad URL, or never answered: Not connected badge, dash, one muted line. |

## Tests

These use fixtures and made-up counts only, never live numbers. The
database is never reached. They include:
- an overlapping-counts case (rows 40/900/60 against a total of 990),
- a pinned status filter,
- an exact-keys route test against the real source with the setting unset,
- the opt-in gate 401 test.

Review stills and their reshoot log stay on the box, under
`/workspace/hotdash-shots/paying-coaches-67/`. They're never committed.
