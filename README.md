# hotdash

Chlk founder dashboard — a Next.js App Router dashboard built with shadcn/ui
(`base-nova`: Base UI primitives + the Nova style) and Tailwind CSS v4.

## Status

**Phase 1 — sidebar shell.** The 14-item sidebar is complete: collapsible
icon rail, light/dark toggle, pinned footer, and active-state highlighting.
The 13 routes it links to are intentional stubs; each gets its own build phase.

## Chlk coach dashboard preview (local only)

`/` renders a **local-only, non-production** preview of the coach-facing Chlk
Dashboard (Figma: *Chlk Dashboard → Landscape Dashboard / RECENTS*). It runs
on mock, in-memory data — no auth, no API, and nothing here is deployed.

| Route | Figma frame | Lower band |
|---|---|---|
| `/` (alias `/recents`) | `119:320` Landscape Dashboard / RECENTS — full design | Recents grid |
| `/playbook-library` | `202:1008` is empty; content mocked after loose group `202:1009` | Filters, Folders, Unorganized Plays |
| `/one-play-a-day` | `202:1085` is empty | Mock featured play + concept |
| `/tutorials` | no frame | Simple placeholder |

The Recents frame is the visual source of truth for the shell (sidebar +
COACHING TOOLBOX hero + grid); the other routes reuse it and swap only the
lower band and the active sidebar item. "Templates (coming soon)" is omitted.

Coach shell code lives in `src/app/(coach)`, `src/components/chlk` and
`src/lib/chlk` (nav + fixtures); exported Figma assets are in `public/chlk`.
The founder dashboard is unchanged and still reachable at `/home`.

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3001 — the Chlk coach dashboard (Recents). The founder
dashboard is at http://localhost:3001/home.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |

## Layout

```
src/
├── app/
│   ├── (coach)/    Chlk coach dashboard preview — `/`, /recents, /playbook-library, /tutorials, /one-play-a-day
│   ├── (founder)/  founder shell layout + one route per sidebar item
│   └── layout.tsx  root: fonts + globals only
├── components/   app-sidebar, theme-provider, theme-toggle
│   ├── chlk/     coach sidebar, coaching toolbox, play cards, playbook library, section
│   └── ui/       shadcn primitives (vendored)
├── hooks/        use-mobile
└── lib/          nav.ts (founder sidebar source of truth), chlk/ (coach nav + fixtures), utils.ts
```

`src/lib/nav.ts` is the single source of truth for the founder sidebar order,
labels, routes and icons; `src/lib/chlk/nav.ts` plays the same role for the
coach sidebar.
