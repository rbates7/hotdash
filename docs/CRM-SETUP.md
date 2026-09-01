# CRM setup

The CRM lives at `/crm` in this dashboard. It runs on demo data out of the
box; the three integrations below are optional and can be added whenever.

## Check your setup before you start

```bash
pnpm crm:doctor
```

Validates `.env.local` and names anything that would stop Gmail connecting —
including a redirect URI that doesn't match the route, which is the easiest
thing to get wrong. Run it after editing `.env.local` and before touching
the Google console.

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
   It must be at least 32 characters; anything shorter is rejected, because
   a short passphrase is brute-forceable against a copied database.
6. Run `pnpm crm:doctor` and fix anything it flags.
7. **CRM → Settings → Connect Google**, approve, then **Sync now**.

> **Sync Stripe before Gmail on the very first run.** Gmail only opens a case
> when the sender is already a known contact; everyone else waits in triage.
> Import customers from Stripe first and your existing customers' mail
> becomes cases immediately instead of arriving as a triage pile. The
> "sync all" endpoint enforces this order, but the per-source buttons do not.

> **Start narrow.** Set `GMAIL_INITIAL_SYNC_WINDOW=7d` for the first pass so
> the result is reviewable, then widen and go again. The sync is idempotent,
> so re-running never duplicates anything.
>
> Widening the window is **not** enough on its own: ordinary syncs resume from
> a stored history cursor and never re-read the window. After changing it,
> restart the server and use **Backfill** on the Settings page (or
> `POST /api/crm/sync/gmail?full=1`), which clears the cursor first. Plain
> "Sync now" will not reach back further.

Optional: `FOUNDER_ALIASES` for send-as addresses that also count as you,
and `GMAIL_INITIAL_SYNC_WINDOW` (default `30d`) for how far back the first
sync reaches. That window takes either a duration (`7d`, `8m`, `2y`) or an
absolute date (`2026-01-01`). Prefer a date when backfilling from a known
starting point — a duration drifts, so a later re-sync after a history gap
would reach further back than the first one did. `pnpm crm:doctor` prints the
Gmail query it resolves to.

### What the sync does

- Mail from a **known contact** → creates/updates a case, one per Gmail
  thread. Your replies land on the same timeline; inbound mail on a closed
  case reopens it with a note.
- Mail from an **unknown human** → waits in **Triage** (promote / link /
  ignore).
- **Contact-form notifications** (Squarespace, Typeform, a site's own mailer)
  are sent *by the form host*, not the person who filled the form in. The
  sender is resolved through `Reply-To`, falling back to the `Email:` field in
  the form body, so the case or triage entry belongs to the coach rather than
  to Squarespace. If your form carries neither, the message still reaches
  triage under the host's name rather than being dropped — an unattributed
  lead is fixable, a missing one is not.
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
