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
datastore exists; use "Reset" in the page header to restore the demo data.

**Phase 3 — Home** is built against the `home-v0` mock: the #1 strip, four
KPI cards, and three doors (Metrics with an MRR trend, Agent Workplace with a
live dev-board preview, Inbox with the "Needs you" rows). The two Workplace
doors read the same browser-saved board state, so closing tickets or
completing the sprint there changes Home. The Home requirements are still
open; figures are dummy.

The other 11 routes are intentional stubs; each gets its own build phase.

**Live Stripe (read-only)** feeds Home's ticker, Subscribers and Cash this
week, and Metrics' MRR, Churn Rate, Trial Conversions and Subscribers when
the server has `STRIPE_READONLY_KEY` (a restricted key; server only). With
no key those tiles show their sample figures, labelled. Definitions, states
and checks: [docs/stripe-live.md](docs/stripe-live.md).

**Live PostHog (read-only)** feeds Metrics' Retention and Active Users
(iOS app events only, from June 2026) when the server has
`POSTHOG_READONLY_KEY` (project pinned in code: 472613, "CHLK iOS"); otherwise those cards
are sample, labelled. See [docs/posthog-live.md](docs/posthog-live.md).

**Live Gmail (read-only)** feeds the CRM — cases, contacts and triage from
the support inbox (info@chlkapp.com) — when the server has `GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN` (server only; `GMAIL_MAILBOX`
optional). Without them the CRM shows "Gmail not connected" and its sample,
labelled. Setup (one consent, `pnpm gmail:consent`), states and checks:
[docs/gmail-setup.md](docs/gmail-setup.md).

**Live GitHub (read-only)**: `GET /api/workboard` returns rbates7/hotdash's
open and recently merged pull requests with their CI and review state
when the server has `GITHUB_READONLY_TOKEN` (or `github_read_only`, the
name the token has in Vercel). The token is fine-grained and read-only,
for this repo only, and server only. It is a data endpoint only for now:
no screen reads it yet, and Agent Workplace is still the design mock.
States, cache and checks: [docs/workboard-live.md](docs/workboard-live.md).

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
| `pnpm check:bundle` | After a build: fail if the Stripe or PostHog key, the database URL, the GitHub token or the Gmail credentials (or their env var names: `STRIPE_READONLY_KEY`, `POSTHOG_READONLY_KEY`, `SUPABASE_READONLY_DB_URL`, `GITHUB_READONLY_TOKEN`, `github_read_only`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`; `GMAIL_MAILBOX` by name) is in client output |
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
