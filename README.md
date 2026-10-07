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
The other 12 routes are intentional stubs; each gets its own build phase.

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
│   └── ui/       shadcn primitives (vendored)
├── hooks/        use-mobile
└── lib/          nav.ts (sidebar source of truth), utils.ts
```

`src/lib/nav.ts` is the single source of truth for sidebar order, labels,
routes and icons.
