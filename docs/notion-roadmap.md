# Product Roadmap from Notion (read-only)

The Product Roadmap reads its bets from one Notion database when the
server has a Notion token and the roadmap's page (or database) id. Until
both are set it is "not connected" and shows the same labelled sample
board as before, with this browser's edits. Nothing is ever written to
Notion.

## Setup

| | |
| --- | --- |
| Env vars | `NOTION_READONLY_TOKEN` and `NOTION_ROADMAP_PAGE_ID`: **server only**, never `NEXT_PUBLIC_`. Both are required. With either missing or invalid, the Roadmap is "not connected" and `/api/health/notion` says `not_configured`. |
| Token | An **internal integration** token (`ntn_…`, or an older `secret_…`). The server refuses anything else; CI's dummy (`ntn_CI-DUMMY-…`, with hyphens) is one it refuses. |
| Token scope | In Notion › Settings › Connections › Develop or manage integrations, create an **internal** integration for the Chlk workspace with **Read content only**: no Update content, no Insert content, no comment capabilities, and **No user information** unless you want owner names from a People property (then "Read user information without email addresses"). Then share **only the roadmap page** with it (the page's ••• › Connections › add the integration). Do not share the workspace or parent pages: the integration can read exactly what is shared with it and its children. |
| Roadmap id | `NOTION_ROADMAP_PAGE_ID` takes any of: the page id, the database id, or a data-source id, as 32 hex digits with or without dashes; or the full link copied from Notion (`https://www.notion.so/…/Roadmap-<32 hex>` or `https://<workspace>.notion.site/…-<32 hex>`; a `?v=` view id is ignored). Anything else — another host, `http:`, a port, a peek link (`?p=`) or a malformed id — is refused, not guessed at. |
| Which database | A database id is read directly (all of its data sources). A page id reads the database on that page: its `child_database` blocks, looking one level into columns and toggles. If the page holds several, the ones titled with "Roadmap" are read; with none so titled, the first. A linked database the API cannot open is skipped. |
| Calls | The official Notion API over `fetch`, `Notion-Version: 2025-09-03` (pinned), Bearer token, redirects refused. Read endpoints only: `GET /v1/databases/{id}`, `GET /v1/data_sources/{id}`, `GET /v1/pages/{id}`, `GET /v1/blocks/{id}/children` (to find the database on a page), and `POST /v1/data_sources/{id}/query` (a query is a read; Notion makes it a POST). Nothing creates, updates or deletes. |
| Limits | 100 rows per query page, followed to the end; over **1,000 rows** the sync fails (`TooManyRowsError`) rather than showing a cut roadmap. At most 500 blocks are scanned on a page and 5 databases read. Each call gives up after 20 s; the whole sync after **240 s** (the routes allow `maxDuration = 300`). |
| Cache | One sync per server process every 5 minutes, always **in the background**: a request never waits for it. It gets the last good copy (`connected`, or `stale` after a failure) while a due sync runs behind it, one at a time; on a cold start it gets `not_connected` at once (the sample board) and the browser's next poll, a minute later, picks up the sync. The routes hand the running sync to `after()` so it outlives the response. A failed or timed-out sync is retried 1 minute after it failed; the last good copy is kept. |
| Logs | `[notion] sync failed: <ErrorClassName>` only (`NotionUnauthorizedError`, `NotionForbiddenError`, `NotionNotFoundError`, `NotionRateLimitedError`, `NotionApiError`, `NoRoadmapDatabaseError`, `TooManyRowsError`, `InvalidDataError`, `SyncTimeoutError`, `TypeError` for a network failure). Never the token, the id, a message or a response body. |

Optional, local only: `NOTION_API_BASE=http://127.0.0.1:<port>` points the
client at a loopback mock. It is ignored in a production build unless
`NOTION_ALLOW_MOCK_BASE=1`, and any non-loopback host disables Notion
entirely, so the token can never be sent somewhere else.

## Endpoints

- `GET /api/notion/roadmap` → `{ status, lastSyncedAt, roadmap }`. `status`
  is `connected` (synced within 5 min), `stale` (Notion failed, or the token
  was removed after a good sync; the last good rows and their
  `lastSyncedAt`), or `not_connected` (no token/id, or no sync has landed
  yet; `roadmap: null`). `roadmap` is `{ items, unplaced }`, mapped fields
  only (below). Never an error body, never an empty roadmap standing in for
  "not connected".
- `GET /api/health/notion` → `{"notion":"ok"|"unavailable"|"not_configured"}`
  only. Same cache, safe to leave public.

## Mapping

Rows become the Roadmap's own card shape (`LiveRoadmapItem`,
`src/lib/notion-roadmap.ts`) in `src/lib/roadmap/notion-map.ts`. Properties
are found **by name**, ignoring case, spacing and punctuation; the first
name in the list that the row has wins, and its Notion type decides how it
is read (title, rich text, select, status, multi-select, people, date,
number, or a string/date formula).

| Card field | Notion property (first that exists) | Fallback |
| --- | --- | --- |
| Title | the database's title property | "Untitled" |
| Column (Now / Next / Later) | Column, Roadmap, Horizon, Stage, Phase, Status | see below |
| Why | Why, Why it matters, Summary, Description, Problem, Notes | none shown |
| Owner | Owner, Owners, DRI, Lead, Assignee, Assignees, Assigned to (People: the first name, "+N" for more) | no owner chip |
| Window | Window, Target window, Target, Quarter, Timeline, Timeframe, When, Release, Target date, Due date, Due, ETA, Launch date, Date (text as written; a date as "Nov 2026", a range as "Nov – Dec 2026") | none shown |
| Order in column | Order, Rank, Position, Sort (a number, ascending; rows without one after) | Notion's order |
| "From Feature Request" chip | a Source, Origin, From, Tags, Labels or Type value naming "feature request", or a checked "From Feature Request" checkbox | no chip |
| Signed (not shown) | Signed, Signed on, Signed at, Committed on | when the row was created |
| Updated (not shown) | the row's last edit | — |

Column values (matched whole, ignoring case and emoji):

- **Now**: now, in progress, doing, building, in development, in dev, active, current, started, this quarter
- **Next**: next, up next, planned, to do, todo, ready, not started, queued, committed, next quarter
- **Later**: later, backlog, someday, future, icebox, ideas, idea, exploring, parked, maybe
- **Left off the board** (no longer a bet): done, shipped, complete(d), launched, released, live, cancel(l)ed, archived, won't do, dropped, abandoned
- **Anything else, or no value**: never guessed into a column. The row is
  left off and counted; the board says "N rows in Notion have no Now, Next
  or Later status, so they are not on the board."

Rows in the trash are skipped. Text is clipped with an ellipsis to the
board's caps (title 80, why 160, window 24, owner 40). Notion has no ticket
count, so a Notion card shows none (rather than "No tickets").

**Only these fields leave the server.** No page ids, URLs, page bodies,
comments, emails or other properties are kept or sent; raw rows are mapped
as soon as they arrive and dropped.

## What the Roadmap shows

| State | Board | Label / note |
| --- | --- | --- |
| Loading (first paint) | skeleton | — |
| Not connected | this browser's board: the sample bets plus any edits, editable, exactly as before | Sample data notice, badge and tags; "Edits save in this browser" + Reset |
| Connected | Notion's rows, same columns and cards | no Sample label; "Read-only · from Notion" (hover: last synced) |
| Stale | Notion's last rows | "Last updated <time>" (Settings time zone) |

Settings › Connected data has a **Notion** row ("Product Roadmap"):
Checking… / Connected (with "Read-only · last synced <time>") / Last
updated <time> / Not connected.

### Edits while Notion is connected

The board is **read-only** while it shows Notion: Move up/down/left/right,
Edit and New bet are disabled ("Read-only: this bet comes from Notion.
Change it there."), and there is no Reset. Local edits are **not** laid
over Notion's rows: an edit that never reaches Notion, on a board that
otherwise mirrors it, would look saved while Notion — the source of truth —
disagreed, and the next sync would put the two at odds. Edits already saved
in this browser are left untouched in `localStorage` (nothing reads or
writes them while Notion is shown) and are on the board again if Notion is
ever disconnected.

## Checks

- `pnpm check:bundle` (after a build) fails if `NOTION_READONLY_TOKEN` —
  the name, or the value when one is set — appears in client output. CI
  builds and scans with the refused dummy.
- e2e and `playwright.config.ts` blank `NOTION_READONLY_TOKEN` and
  `NOTION_ROADMAP_PAGE_ID`; the specs mock `/api/notion/roadmap` in the
  browser for connected and stale. Nothing in CI calls Notion.
- Unit tests (`src/lib/server/notion.test.ts`) run the client against fake
  responses and a loopback HTTP mock: page → child database, pagination,
  the row cap, bad ids and tokens, cache TTL, never awaiting a sync, the
  time limit, stale / not connected, and logs without the token.
