# Chlk Founder Dashboard

> **Chlk's fork** of the [Cursor Cookbook `sdk/agent-kanban`](https://github.com/cursor/cookbook/tree/main/sdk/agent-kanban) — adapted as the foundation for Chlk's internal founder ops dashboard.

A Linear-style board for Chlk specialist bots and Cursor Cloud Agents. It uses the Cursor SDK to list
cloud agents, group them into kanban columns, preview artifacts on cards, and
create new cloud agents from a repository and prompt.

## What's in this board

- **Cursor Cloud Agents** — live data via the Cursor SDK, same as the upstream cookbook.
- **Chlk Ticket Model** — any card can be enriched with Chlk-specific metadata: `owner`
  (which specialist bot owns it), a four-state `chlkStatus` (To Do / In Progress / Blocked /
  Done), and a `blockerReason` when blocked. This overlay lives alongside the Cursor agent
  lifecycle status rather than replacing it.
- **Founder Strip** — a persistent bar above the board showing Rashad's single #1 priority
  and the count of open decisions that need his input. Click ★ on any card to set it as #1;
  click ⚠ to flag it for a founder decision.
- **Agent-update path** — specialist bots can call `PATCH /api/tickets/<id>` to move their
  own card between statuses without touching the UI. See [AGENTS.md](./AGENTS.md) for the
  full contract and examples.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open the local Next.js URL and complete onboarding by entering a Cursor API key
from the [Cursor integrations dashboard](https://cursor.com/dashboard/integrations).
If you keep "Remember this key" checked, the key is stored locally at
`~/.agent-kanban/settings.json`; otherwise it is kept only in the in-memory app
session.

## How agents update card status

See **[AGENTS.md](./AGENTS.md)** for the full spec. Short version:

```bash
# Move to In Progress
curl -X PATCH http://localhost:3000/api/tickets/<ticketId> \
  -H "Content-Type: application/json" \
  -d '{"owner":"design-bot","chlkStatus":"in_progress"}'

# Block with a reason + flag for founder
curl -X PATCH http://localhost:3000/api/tickets/<ticketId> \
  -H "Content-Type: application/json" \
  -d '{"chlkStatus":"blocked","blockerReason":"Waiting for brand colors","needsFounderDecision":true}'
```

Ticket metadata is persisted in `~/.agent-kanban/chlk-tickets.json` and survives server
restarts. No authentication is required — this is a local tool.

## Notes

Repository listing is rate-limited by the Cloud Agents API and is cached briefly
in memory. Artifact previews are fetched through authenticated local API routes,
so refresh the board if a preview stops loading.
