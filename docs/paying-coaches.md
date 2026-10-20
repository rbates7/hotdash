# Paying coaches tile

Home, under the KPI strip. The number of coaches with an **active**
subscription, split by how they pay (App Store, Stripe, invoice), plus the
total. Scope: Radcliffe via Simmons, Oct 19 2026.

| | |
|---|---|
| Route | `GET /api/subscriptions/paying`: server only, `no-store`, counts only (no names, ids or URL). Never an error body. |
| Source | Chlk's Supabase Postgres, `chlk.subscriptions` (schema owner: **Radcliffe**). |
| Setting | `SUPABASE_READONLY_DB_URL`: the **same** server-only, read-only URL the App Store count already uses (see [stripe-live.md](./stripe-live.md)). No new env var. Already covered by `scripts/check-client-bundle.mjs`. |
| Cache | One read per 5 minutes in the background, last good counts kept (same pattern as `src/lib/server/app-store.ts` and `stripe.ts`). Retry after 60 s on failure. 10 s statement timeout, `read only` transaction, TLS required. |

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
not zero, so the rows always add up. The total counts distinct coaches.

## States (#50)

| Status | Tile |
|---|---|
| `connected` | Total and three method rows. |
| `stale` | Last good counts plus "Last updated …" (`lastUpdatedLabel`). |
| `connecting` | URL set, first read running: Connecting… badge, dashes. |
| `not_connected` | No URL, a bad URL, or never answered: Not connected badge, no figures. |

This is not the **Subscribers** figure, which is Stripe paying + App
Store-only payers + free accounts (`src/lib/subscriber-total.ts`).

## Tests

Fixtures and made-up counts only, never live numbers. The database is never reached.
