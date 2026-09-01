# CRM setup

The CRM lives at `/crm` in this dashboard. It runs on demo data out of the
box; the three integrations below are optional and can be added whenever.

## First run (no credentials)

```bash
pnpm install
pnpm crm:seed     # demo data: 6 contacts, 8 cases, 2 triage threads
pnpm dev
```

Open http://localhost:3000/crm. The Settings tab will show all three
integrations as "not configured", which is expected.

Data lives in a SQLite file at `data/crm.db` (gitignored). Re-run
`pnpm crm:seed` any time to wipe and reset it.

## 1. Google / Gmail — email-to-case

The CRM polls your mailbox read-only (`gmail.readonly`) and turns threads
from known contacts into cases.

1. https://console.cloud.google.com → create a project (e.g. `chlk-dashboard`).
2. **APIs & Services → Library** → "Gmail API" → **Enable**.
3. **OAuth consent screen**: choose **Internal** (your inbox is on Google
   Workspace, so this needs no verification and refresh tokens never
   expire). Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI:
   `http://localhost:3000/api/crm/google/callback`
   (add your deployed URL later if this ever leaves localhost).
5. Copy the client ID/secret into `.env.local`, and set `APP_SECRET`
   (`openssl rand -hex 32`) — it encrypts the stored Google tokens at rest.
6. **CRM → Settings → Connect Google**, approve, then **Sync now**.

Optional: `FOUNDER_ALIASES` for send-as addresses that also count as you,
and `GMAIL_INITIAL_SYNC_WINDOW` (default `30d`) for how far back the first
sync reaches.

### What the sync does

- Mail from a **known contact** → creates/updates a case, one per Gmail
  thread. Your replies land on the same timeline; inbound mail on a closed
  case reopens it with a note.
- Mail from an **unknown human** → waits in **Triage** (promote / link /
  ignore).
- **Bulk mail** (List-Unsubscribe, Precedence, no-reply senders) from
  unknown senders → skipped entirely, so no Gmail filters are needed.
- Your own outbound threads with no case (investors, lawyers) → ignored.

## 2. Stripe — customers become contacts with plans

1. Stripe Dashboard → **Developers → API keys → Create restricted key**.
2. Grant **Customers: Read** and **Subscriptions: Read** only.
3. Set `STRIPE_API_KEY` in `.env.local`.
4. Map your price IDs to plan names in `src/lib/crm/stripe/plan-map.ts`.
5. **CRM → Settings → Stripe → Sync now**.

## 3. Supabase — name and organization enrichment

Optional. Enriches contacts that already exist; it never creates them.

1. Create a read-only role in the Supabase SQL editor:

   ```sql
   create role hotdash_ro login password '<strong password>';
   grant usage on schema public to hotdash_ro;
   grant select on public.users to hotdash_ro;
   ```

2. Edit the query in `src/lib/crm/supabase/mapping.ts` so it returns
   `email`, `first_name`, `last_name`, `org_name` from your real schema.
3. Set `SUPABASE_DB_URL` (use the **session pooler** string on IPv4-only
   networks) and hit **Sync now**.

Precedence when sources disagree: **manual edits > Supabase > Stripe >
Gmail**. Anything you type in the UI is never overwritten by a sync.

## Sync scheduling

While `pnpm dev` runs, an in-process scheduler polls Gmail every 2 min,
Stripe every 15 min, Supabase hourly (`SYNC_*_INTERVAL_SEC` to change).
Unconfigured sources are skipped silently. Pause it from CRM → Settings, or
set `DISABLE_SYNC_SCHEDULER=1` and use the Refresh buttons.
