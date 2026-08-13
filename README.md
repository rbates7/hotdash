# Chlk Dev Board

Internal dev board for the Chlk football app team. Five-column kanban (Backlog → To Do → Building → Review → Done) with drag-and-drop, a click-in detail drawer, and disk-persisted cards.

**Not Jira. Not Ops kanban. Not founder strip.** This is the team's single screen for tracking dev work.

---

## Local run

```bash
pnpm install
pnpm dev
```

Opens on **http://localhost:3000**.

> If port 3000 is busy (it usually is):
> ```bash
> pnpm dev -- --port 3001
> ```

Seed cards are written to `data/hq-cards.json` on first run. That file is gitignored; delete it to reset to seed.

---

## Other commands

```bash
pnpm build    # production build
pnpm lint     # ESLint check
pnpm start    # serve the production build (run pnpm build first)
```

---

## Card model (`hq_cards`, board = `dev`)

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `owner` | yes | string — Fitz, Dev Agent, Rashad, etc. |
| `status` | yes | `backlog` / `to_do` / `building` / `review` / `done` |
| `label` | no | `bug` / `feature` / `chore` / `spike`. One chip. Empty allowed. |
| `description` | no | Work being done; shown in detail drawer. |
| `estimate_hours` | no | Number, 0.5 ok. Displayed as `11h`. Never money or points. |
| `chlk_key` | no | Jira key string only (e.g. `CHLK-369`). No Atlassian embed. Cards work fine with no key. |
| `comments[]` | | `{ author, body, created_at }` — append-only. Timestamps in America/Chicago. |
| `updated_at` | yes | ISO string, updated on every write. |

---

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hq/cards` | List all dev-board cards |
| `GET` | `/api/hq/cards/:id` | Get one card |
| `PATCH` | `/api/hq/cards/:id` | Update `status`, `owner`, `label`, `description`, `estimate_hours`, `title` |
| `POST` | `/api/hq/cards/:id/comments` | Append comment `{ author, body }` |

---

## Visual tokens

| Token | Value |
|---|---|
| Paper bg | `#FCFAF5` |
| Ink | `#1A1C18` |
| Navy | `#072839` |
| Varsity Blue (accent) | `#2B76BA` |
| Baby Blue | `#E1F2FB` |
| Sharp Red | `#DE4728` |
| Line | `#EAE8E2` |
| Font | Plus Jakarta Sans + JetBrains Mono |

No orange. No custom labels. No priority field. No chlk-v2 API calls. No production deploy.

---

## Scope

**In v0:** five-col board, compact cards, detail drawer, drag-and-drop, persist on disk, seed data, Chicago timestamps.

**Out of v0:** Ops kanban, founder strip, Needs Rashad, metrics/MRR, Approvals, agent page, multi-board, priority, custom labels, Jira sync, standup digest UI.
