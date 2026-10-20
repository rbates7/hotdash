# Live GitHub (read-only): the workboard data

`GET /api/workboard` reads rbates7/hotdash's pull requests from GitHub:
the open ones and the ones merged in the last 14 days, each with its CI,
review and board state. Agent Workplace's **Work board** tab reads it
(`src/components/agent-workplace/work-board.tsx`, through
`src/hooks/use-workboard.ts`): Connecting… before the first answer or while
the first sync runs, Not connected with no token, "No open pull requests"
when the board is empty, the rows in four columns, and a stale note over
the last good rows after a failed sync. It never shows sample rows.

## Setup

| | |
| --- | --- |
| Env vars | `GITHUB_READONLY_TOKEN`, then `github_read_only`. **Server only**, never `NEXT_PUBLIC_`. The first one that is set (not blank) wins. With neither, the workboard is "not connected". |
| Why two names | Rashad added the token in Vercel as `github_read_only`. The code reads that name as a fallback, so it works without an env change. `GITHUB_READONLY_TOKEN` matches the other read-only keys and comes first. |
| Token | A **fine-grained, read-only** token for **rbates7/hotdash only**, with read access to Pull requests, Checks, Commit statuses and Metadata, and nothing else. No write permission and no other repository. The server only sends a value made of word characters (`^[A-Za-z0-9_]{20,255}$`, so classic `ghp_…` and fine-grained `github_pat_…` both work). Anything else is "not connected" and is never sent. |
| Calls | `GET` only, to `https://api.github.com/repos/rbates7/hotdash`, as `Authorization: Bearer`: `/pulls?state=open` and `/pulls?state=closed&sort=updated&direction=desc` (pages of 100, stopping at the 14-day cutoff), and for each open PR `/pulls/{n}`, `/pulls/{n}/reviews`, `/commits/{sha}/check-runs` and `/commits/{sha}/status`, 4 PRs at a time. No other method, no other repository, no other host. That's about 2 + 4 × (open PRs) calls per sync. |
| Cache | One sync per server process every 5 minutes, always **in the background**: a request never waits for it. It gets the last good copy (`connected`, or `stale` after a failure) while a due sync runs behind it, one at a time. The route hands the running sync to `after()` so it outlives the response. A sync over 240 s is a failure (the route allows 300 s). A failed sync retries 1 minute after it failed. The last good copy is kept indefinitely. |
| Logs | A failed sync logs one fixed word (`GitHubHttpError`, `IncompleteData`, `SyncTimeout` or `UnknownError`), never the error's message, a response body or the token. |

## Endpoint

`GET /api/workboard` → `{ status, connected, fetchedAt, stale, items }`,
`Cache-Control: no-store`. It never returns an error body. `status` follows
the same rules as the Stripe summary (`src/lib/server/stripe.ts`):

| `status` | When | `connected` / `stale` | `items` |
| --- | --- | --- | --- |
| `connecting` | A usable token is set and the first sync is still running (a fresh server, just after a deploy). | `false` / `false` | `[]` |
| `connected` | The last sync succeeded within the 5-minute window. `fetchedAt` is when it ran. | `true` / `false` | the board |
| `stale` | The last sync failed; these are the last good items, as of `fetchedAt`. | `true` / `true` | last good board |
| `not_connected` | No (usable) token, or no sync has ever succeeded. A failed or timed-out first sync is not connecting: it, and every retry after it, is `not_connected` until a sync lands. With no token it is always `not_connected`, never `connecting`. | `false` / `false` | `[]` |

Each item is `{ number, title, url, owner, branch, state, ci, review,
proofLinks, updatedAt, mergedAt }`. `state` is `working`, `needs_fix`,
`ready_for_review` or `merged`; `ci` is `passing`, `failing`, `pending` or
`none`; `review` is `approved`, `changes_requested`, `pending` or `none`.
The rules are in `src/lib/workboard.ts` (pure, unit-tested).

## Checks

- `pnpm check:bundle` (CI, after `pnpm build` with a dummy
  `GITHUB_READONLY_TOKEN`) scans `.next/static` and prerendered output for
  the dummy value and for the strings `GITHUB_READONLY_TOKEN` and
  `github_read_only`, and fails if any is there.
- CI and Playwright run the app with `GITHUB_READONLY_TOKEN` and
  `github_read_only` both blank, so CI never calls GitHub.
  `e2e/workboard-api.spec.ts` checks the exact shape and `not_connected`.
  The build never calls GitHub either: the route is `force-dynamic`.
- Unit tests (`src/lib/server/workboard.test.ts`) fake the loader and
  `fetch`. They check every state above, the cache and retry timings, the
  timeout, that every call is a `GET` with the bearer header, and that
  logs never carry the token.
