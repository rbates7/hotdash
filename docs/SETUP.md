# Setup

hotdash needs three external connections. Gmail is required for
email-to-case; Stripe and Supabase are optional and can be added any time.

## First run (no credentials needed)

```bash
pnpm install
cp .env.example .env.local        # fill in as you go; empty is fine to start
pnpm db:seed                      # optional: demo data so every screen has content
pnpm dev
```

Open http://localhost:3000. With `APP_PASSWORD` empty the login gate is
off. Before hosting anywhere, set both `APP_PASSWORD` and `APP_SECRET`
(`openssl rand -hex 32`) — `APP_SECRET` also encrypts your stored Google
tokens, so treat it like a private key.

To wipe demo data, delete `data/hotdash.db` and restart (the schema is
recreated automatically).

## 1. Google / Gmail (email-to-case)

hotdash polls your mailbox with the read-only `gmail.readonly` scope. One-time
Google Cloud Console setup:

1. Go to https://console.cloud.google.com → create a project (e.g. `hotdash`).
2. **APIs & Services → Library** → search "Gmail API" → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - Your inbox is on **Google Workspace** (custom domain): choose **Internal**.
     This is the good path — no verification, and refresh tokens never expire.
   - App name `hotdash`, your email for support/developer contact. Save.
   - Scopes: add `https://www.googleapis.com/auth/gmail.readonly`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - Authorized redirect URI: `http://localhost:3000/api/google/callback`
     (add your production URL later, e.g. `https://dash.example.com/api/google/callback`).
5. Copy the client ID and secret into `.env.local`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
6. In hotdash: **Settings → Connect Google** → approve. The page should show
   "Connected as …". Hit **Sync now**.

> **If you ever use a personal @gmail.com instead** (External consent
> screen): an app left in *Testing* status has its refresh tokens revoked
> every 7 days — sync would silently die weekly. Set Publishing status to
> **In production** without completing verification; as the app's only user
> you click through the "unverified app" warning once and tokens then
> persist. Full verification is only needed if other people would use it.

Useful env knobs:

- `FOUNDER_ALIASES` — comma-separated send-as addresses that should count
  as "you" when detecting inbound vs. outbound mail.
- `GMAIL_INITIAL_SYNC_WINDOW` (default `30d`) — how far back the first sync
  reaches. Older threads only become cases if new mail arrives on them.

### What the sync does with mail

- From a **known contact** (matched by email) → creates/updates a case,
  one case per Gmail thread. Whole-thread backfill captures your earlier
  replies. Inbound mail on a closed case reopens it.
- From an **unknown human** → waits in **Triage** (promote / link / ignore).
- **Bulk mail** (List-Unsubscribe or Precedence headers, no-reply senders)
  from unknown senders → skipped entirely; it stays in Gmail untouched.
- Your outbound mail in threads without a case (investors, lawyers, …) →
  ignored.

## 2. Stripe (customers → contacts + plans)

Use a **restricted** key — hotdash only ever reads.

1. Stripe Dashboard → **Developers → API keys → Create restricted key**.
2. Name `hotdash`; grant **Customers: Read** and **Subscriptions: Read**;
   everything else None.
3. Put the `rk_live_…` key in `.env.local` as `STRIPE_API_KEY`.
4. Map your price IDs to display names in `src/lib/stripe/plan-map.ts`
   (unmapped plans fall back to the price nickname).
5. **Settings → Stripe → Sync now**. Every Stripe customer with an email
   becomes a contact; their most representative subscription sets the plan.

## 3. Supabase (name + organization enrichment)

Optional. hotdash connects straight to the Chlk Postgres with a read-only
role and only enriches contacts that already exist (from Stripe or email) —
it never creates them.

1. Create a read-only role (Supabase SQL editor):

   ```sql
   create role hotdash_ro login password '<strong password>';
   grant usage on schema public to hotdash_ro;
   grant select on public.users to hotdash_ro;  -- plus any other tables the mapping reads
   ```

2. Point the mapping at your real schema in `src/lib/supabase/mapping.ts` —
   edit the query so it returns `email`, `first_name`, `last_name`,
   `org_name` columns from wherever profiles actually live.
3. Get the connection string from **Project Settings → Database**. On
   IPv4-only networks use the **session pooler** string. Swap in the
   `hotdash_ro` credentials and set it as `SUPABASE_DB_URL`.
4. **Settings → Supabase enrichment → Sync now**.

Field precedence when sources disagree: **manual edits > Supabase > Stripe >
Gmail** — an edit you make in the UI is never overwritten by a sync.

## Sync scheduling

While the app is running, an in-process scheduler polls Gmail every 2 min,
Stripe every 15 min, Supabase hourly (tunable via `SYNC_*_INTERVAL_SEC`).
Pause it from Settings, or disable it entirely with
`DISABLE_SYNC_SCHEDULER=1` and trigger `POST /api/sync/all` from cron
instead. See `docs/DEPLOY.md` for hosting implications.
