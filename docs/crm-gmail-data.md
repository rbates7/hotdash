# Durable CRM data

The production CRM stores cases, contacts, email messages, notes, triage
decisions, OAuth tokens and sync history in Postgres. Browser storage is not
part of the copied CRM's data model.

## Sources

- **Stripe first:** customers become contacts and active subscription prices
  become Monthly, Annual or Staff plan labels.
- **Gmail second:** known contacts become cases; unknown human senders enter
  Triage. Whole-thread backfill preserves earlier replies.
- **Chlk database third:** `chlk.profiles` enriches names and
  `chlk.organizations` provides authoritative organization names.

Manual edits take precedence over Chlk enrichment, then Stripe, then Gmail.
Every sync is idempotent: Gmail message IDs, thread IDs, normalized contact
emails, Stripe customer IDs and case numbers are unique.

## Case behavior

- One Gmail thread maps to one case.
- An inbound message on a closed case reopens it.
- Statuses are `new`, `open`, `waiting` and `closed`.
- Priority is `low`, `normal`, `high` or `urgent`.
- User and system notes share the case timeline.
- Replies remain in Gmail; the CRM links to the original thread.
- Unknown senders can be promoted, linked to an existing contact, ignored for
  one conversation or ignored permanently.

## Message safety

Email is rendered as plain text. HTML is reduced to text server-side; scripts,
event attributes, unsafe links and remote tracking images do not reach the
browser. Attachment names, MIME types and sizes are stored, but attachment
bytes are not downloaded.

## Synchronization

Vercel Cron calls the authenticated `GET /api/crm/sync/<source>` routes using
`CRON_SECRET`. Manual refresh uses same-origin `POST` requests behind the
dashboard gate. A Postgres lease prevents overlapping runs across Vercel
instances. Pause state, cursors and the most recent sync runs are durable.

The full bootstrap order is:

1. `POST /api/crm/sync/stripe`
2. `POST /api/crm/sync/gmail`
3. `POST /api/crm/sync/supabase`

`POST /api/crm/sync/all` performs that sequence automatically.

## Required production configuration

- Neon Marketplace `DATABASE_URL` (or the `CRM_DATABASE_URL` override)
- `CRM_TOKEN_SECRET`
- `CRON_SECRET`

The CRM reuses the dashboard's existing `GMAIL_*`, `STRIPE_READONLY_KEY` and
`SUPABASE_READONLY_DB_URL` credentials. `CRM_GOOGLE_*`,
`CRM_STRIPE_API_KEY` and `CRM_SUPABASE_DB_URL` are optional overrides.

Apply committed database migrations with `pnpm crm:db:migrate` before
deploying code that depends on them.
