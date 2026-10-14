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

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill it in, see "Sign-in" below
pnpm dev
```

Open http://localhost:3000 — it sends you to `/sign-in`, then to `/home`.

## Sign-in

Every page and API route is locked by `src/proxy.ts` (Next 16's name for
middleware). One account can sign in, with email and password:

| Variable | What |
|---|---|
| `ADMIN_EMAIL` | The one email allowed in |
| `ADMIN_PASSWORD_HASH` | From `pnpm auth:hash` (prompts; never pass the password as an argument) |
| `AUTH_SECRET` | 32+ random characters, e.g. `openssl rand -base64 48`; signs the 7-day session cookie |

If any is missing or invalid, nobody can sign in and `/sign-in` says
"Sign-in isn't configured". In `.env.local`, escape every `$` in the hash as
`\$` (Next expands `$NAME` even inside quotes); in Vercel, paste it raw.
Changing `AUTH_SECRET` or `ADMIN_EMAIL` signs everyone out. Failed sign-ins
are limited to 5 per 15 minutes per IP + email, counted per server instance.

Sign out from Settings → Account or the sidebar's Logout. The e2e suite uses
the test-only credentials in `e2e/support/test-credentials.ts`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
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
