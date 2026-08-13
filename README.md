# Chlk Founder Dashboard

> **Chlk's fork** of the [Cursor Cookbook `sdk/agent-kanban`](https://github.com/cursor/cookbook/tree/main/sdk/agent-kanban) — adapted as the foundation for Chlk's internal founder ops dashboard.

A Linear-style board for Cursor Cloud Agents. It uses the Cursor SDK to list
cloud agents, group them into kanban columns, preview artifacts on cards, and
create new cloud agents from a repository and prompt.

This example demonstrates:

- required API-key onboarding before any Cloud Agent data loads,
- cloud-agent listing with grouping by status, repository, branch, or created
  date,
- agent cards with status, repo/branch metadata, latest activity, PR link, and
  artifact previews,
- create-agent flows backed by `Agent.create({ cloud: { repos } })`,
- authenticated artifact media previews proxied through local API routes.

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

## Notes

Repository listing is rate-limited by the Cloud Agents API and is cached briefly
in memory. Artifact previews are fetched through authenticated local API routes,
so refresh the board if a preview stops loading.

## Chlk Roadmap

This board is the starting point for Chlk's founder operations layer. Planned adaptations:

- **Specialist bot self-service** — each specialist bot (design, growth, eng, ops) will update its own ticket status directly on the board via the Cursor SDK, eliminating manual status chases.
- **Chlk Ops board hygiene** — a dedicated Chlk Ops agent owns overall board health: archiving stale cards, flagging blocked agents, and surfacing blockers in a daily digest.
- **Founder strip for Rashad** — a pinned top strip showing Rashad's single #1 priority at any moment, auto-populated from the highest-priority in-progress agent card across all repos.
