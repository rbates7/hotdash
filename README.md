# hotdash

Chlk's founder ops dashboard — a single-user, email-to-case support CRM in
the spirit of Salesforce Service Cloud, sized for one founder.

**The loop:** a Chlk user emails you → hotdash turns the Gmail thread into a
**Case** tied to that user → every later reply (theirs and yours) lands on
the case timeline → when they email again months later, the whole history is
one click, not an inbox excavation.

## What it does

- **Email-to-case** — polls Gmail (read-only OAuth). One case per thread,
  automatic status flow (inbound reopens closed cases, your reply parks the
  case on the customer), whole-thread backfill, internal notes, sanitized
  HTML email rendering, "Open in Gmail" everywhere. Replying stays in Gmail.
- **Contacts from Stripe** — customers become contacts with their plan;
  Supabase enrichment fills names and organizations from the Chlk app DB.
  Precedence: manual edits > Supabase > Stripe > Gmail.
- **Triage** — mail from unknown humans waits for promote / link / ignore;
  newsletters and receipts are filtered out by their own headers, so no
  Gmail-side labels or filters are needed.
- **Console UI** — Service Cloud-style case view with a status Path bar,
  filterable case/contact lists, a dashboard (open counts, oldest
  untouched, recent activity), and a ⌘K palette (`#42`, names, emails).
- **Single user by design** — optional password gate; SQLite file storage;
  Google tokens encrypted at rest.

## Quickstart

```bash
pnpm install
cp .env.example .env.local
pnpm db:seed     # demo data so every screen has content
pnpm dev
```

Then connect the real integrations with [docs/SETUP.md](docs/SETUP.md)
(Google Cloud walkthrough, Stripe restricted key, Supabase read-only role).
Hosting options and tradeoffs: [docs/DEPLOY.md](docs/DEPLOY.md).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js dev / production build / serve |
| `pnpm check` | lint + typecheck + unit tests |
| `pnpm test` | vitest unit suite |
| `pnpm e2e` | Playwright end-to-end suite (builds, seeds `.tmp/e2e.db`, runs against a prod server) |
| `pnpm db:generate` | regenerate Drizzle migrations after a schema change |
| `pnpm db:seed` | reset the local DB with demo data |

## How it's put together

Next.js App Router + TypeScript + Tailwind v4 + shadcn (base-nova on
Base UI), Drizzle + better-sqlite3 (schema kept Postgres-portable), thin
route handlers delegating to `src/lib/<domain>/`:

```
src/lib/
  cases/      status rules (transition matrix), case numbering, queries
  contacts/   email matching, name-source precedence, queries
  gmail/      OAuth client, MIME/bulk parsing, incremental history sync
  triage/     promote / link / ignore
  stripe/     customer + subscription full-scan sync, plan-map (FILL IN)
  supabase/   read-only enrichment adapter, mapping config (FILL IN)
  sync/       runner (overlap guard, sync_runs log) + in-process scheduler
  auth/       HMAC session cookie, AES-256-GCM token encryption
  db/         Drizzle schema, SQLite client, migrations in ./drizzle
```

Two files are deliberately unfinished until real account details exist:
`src/lib/stripe/plan-map.ts` (price id → plan name) and
`src/lib/supabase/mapping.ts` (the profile query for the Chlk schema).
