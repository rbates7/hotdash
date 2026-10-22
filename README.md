# hotdash

Chlk founder dashboard — a Next.js App Router dashboard built with shadcn/ui
(`base-nova`: Base UI primitives + the Nova style) and Tailwind CSS v4.

## Status

**Phase 1 — sidebar shell** is complete: collapsible icon rail, light/dark
toggle, pinned footer, and active-state highlighting.

**Phase 2 — Agent Workplace** is built against the `workplace-v0` mock:
Issues board (five columns, All/Members/Agents/New, "agents working" pill),
Backlog with sprints, ticket view, Agents roster, Autopilots, Inbox, and a
Chat door. Board edits are saved to the browser's localStorage until a real
datastore exists; use "Clear my entries" in the page header to remove what you added.

**Phase 3 — Home** is built against the `home-v0` mock: the #1 strip, four
KPI cards, and three doors (Metrics with an MRR trend, Agent Workplace with a
live dev-board preview, Inbox with the "Needs you" rows). The two Workplace
doors read the same browser-saved board state, so closing tickets or
completing the sprint there changes Home. The Home requirements are still
open. Cards with no live source say Not connected.

The other 11 routes are intentional stubs; each gets its own build phase.

**Live Stripe (read-only)** feeds Home's ticker, Subscribers and Cash this
week, and Metrics' MRR, Churn Rate, Trial Conversions and Subscribers when
the server has `STRIPE_READONLY_KEY` (a restricted key; server only). With
no key those tiles say Not connected, with no figure. Metrics › Overview
also has an MRR (12 months) and Cash this week panel from the same cache
(`GET /api/stripe/mrr-cash`), with no sample state. Definitions, states,
endpoints and checks: [docs/stripe-live.md](docs/stripe-live.md).

**Live PostHog (read-only)** feeds Metrics' Retention and Active Users
(iOS app events only, from June 2026) when the server has
`POSTHOG_READONLY_KEY` (project pinned in code: 472613, "CHLK iOS"); otherwise those cards
say Not connected. See [docs/posthog-live.md](docs/posthog-live.md).

**Product Roadmap from Notion (read-only)** when the server has
`NOTION_READONLY_TOKEN` (server only). `NOTION_ROADMAP_PAGE_ID` is optional:
it defaults to CHLK's Product Roadmap database and only overrides it. With a
token set, the first sync shows Connecting… (never sample bets); with no
token, the Roadmap says Not connected and shows no bets. Setup, token scope
and the property mapping: [docs/notion-roadmap.md](docs/notion-roadmap.md).

**CRM** turns the read-only support inbox into durable cases, contacts,
triage decisions and internal notes. Its Postgres store uses the Neon
Marketplace `DATABASE_URL` (or `CRM_DATABASE_URL` override); scheduled syncs
use `CRON_SECRET`. Gmail reuses the
dashboard's existing `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN` and optional `GMAIL_MAILBOX`, while Stripe and Chlk
enrichment reuse `STRIPE_READONLY_KEY` and `SUPABASE_READONLY_DB_URL`.
Records and edits survive browsers and deployments. Setup and data behavior:
[docs/crm-gmail-data.md](docs/crm-gmail-data.md).

**Live GitHub (read-only)**: `GET /api/workboard` returns rbates7/hotdash's
open and recently merged pull requests with their CI and review state
when the server has `GITHUB_READONLY_TOKEN` (or `github_read_only`, the
name the token has in Vercel). The token is fine-grained and read-only,
for this repo only, and server only. No screen shows the workboard itself
yet (Agent Workplace's board is still the design mock), but the Inbox reads
its PRs. States, cache and checks: [docs/workboard-live.md](docs/workboard-live.md).

**Inbox (read-only)**: `GET /api/inbox` feeds the Workplace Inbox tab and
Home's "Needs you". It shows GitHub PRs ready for review or needing a fix
(through the workboard above) and Sentry issues from org `chlk`, project
`chlk-ios` (via `us.sentry.io`). Sentry needs `SENTRY_READONLY_TOKEN`: server
only, with read-only `project:read` and `event:read` scopes. Home lists only
what needs the founder; the tab lists everything. Each source is connecting,
connected, stale or not connected (the #50 rule: no token is never
connecting, and a failed first sync is not connected). There's a 5-minute
cache with a 1-minute retry, and never sample rows. Gmail is a stub (Not
connected). Bugs lists the same Sentry rows, plus only the bug tickets the
founder created on the Workplace board. See [docs/inbox.md](docs/inbox.md).

**Login gate:** with `DASHBOARD_LOGIN_EMAIL` and `DASHBOARD_GATE_SECRET`
both set, every page and `/api` route needs a sign-in at `/unlock` (one email
+ one password, 7-day cookie). Neither set = open; only one set = locked and
flagged as misconfigured. See [docs/dashboard-gate.md](docs/dashboard-gate.md).

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 — it redirects to `/home`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm crm:db:generate` | Generate a CRM Postgres migration after a schema change |
| `pnpm crm:db:migrate` | Apply committed CRM migrations using `CRM_DATABASE_URL` or Neon’s `DATABASE_URL` |
| `pnpm check:bundle` | After a build: fail if any dashboard or CRM server credential—or its environment-variable name—reaches client output |
| `pnpm gmail:consent` | One-time: sign in as the support inbox and print the Gmail env vars (see docs/gmail-setup.md) |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit + component tests |
| `pnpm test:e2e` | Playwright smoke (`pnpm exec playwright install chromium` once) |

## Layout

```
src/
├── app/          route per sidebar item, plus layout + globals
├── components/   app-sidebar, theme-provider, theme-toggle
│   ├── agent-workplace/  board, backlog, ticket view, store
│   ├── home/     #1 strip, KPI strip, doors
│   └── ui/       shadcn primitives (vendored)
├── hooks/        use-mobile
└── lib/          nav.ts (sidebar source of truth), utils.ts
```

`src/lib/nav.ts` is the single source of truth for sidebar order, labels,
routes and icons.
