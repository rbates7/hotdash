# CRM data from Gmail (`GET /api/crm/gmail`)

Contract: `src/lib/crm/types.ts` (agreed with Koenig, Oct 19 2026). Server data only; the UI is Koenig's.

## Endpoints (both behind the dashboard gate; logged out = 401)

- `GET /api/crm/gmail` → `CrmListResponse`: `status`, `lastUpdated`, `counts`, `cases`, `accounts`, `recentActivity`.
  For the current CRM screens it also still carries the older fields (`lastSyncedAt`, `mailbox`, `data`) until the new UI lands; new code should not read them.
- `GET /api/crm/gmail?caseId=case-<n>` → `CrmThreadResponse` with full message bodies for one thread. 400 for a malformed id, 404 for an unknown case.

Never an error body and never a secret: Gmail failures show as `stale` (last good data) or `not_connected`.

## Freshness

## Caching

- **List (`GET /api/crm/gmail`):** read from Gmail at most every 5 minutes into a last-good cache. A failed read keeps the last good copy and reports `stale`, and retries after 1 minute. A request never waits for Gmail; a due sync runs after the response.
- **One case (`?caseId=case-<n>`):** that thread's full messages are fetched on demand and cached 5 minutes per thread. The Gmail call is cut off after 8 seconds; on a timeout or failure the last cached copy (or the list's snippets) is returned as `stale`.

## Message bodies are plain text only

No HTML is ever sent. `CrmMessage` has no `bodyHtml`; `bodyText` is the text/plain part, or the HTML part reduced to text on the server (script/style/head dropped, every tag and comment removed, entities decoded and stripped again), or the snippet. Scripts, `on*` attributes, `javascript:` links and remote images never reach the browser, so the UI has nothing to sanitize.

## How fields are derived

- **Case** = one Gmail thread with a customer the inbox has replied to (existing rules from #46/#58). Bounces, billing notices and outbound-only threads are dropped. Unanswered first contacts are triage and are not cases.
- **status**
  - `closed`: the thread was archived (no INBOX label) after the customer wrote.
  - `waiting_on_us`: the last message is from the customer.
  - `waiting_on_them`: the last message is from us.
  - `open`: not produced from Gmail today (Gmail has no "open" marker); kept for the UI's filters. `counts.open` counts every case that is not closed.
- **waitingOnUsSince**: the first customer message after our last reply.
- **priority**: starred → `high`; starred and waiting on us for over 24 hours → `urgent`; otherwise `normal`. `low` is never derived.
- **unread**: any message in the thread has Gmail's UNREAD label.
- **labels**: Gmail system labels only (inbox, starred, important, unread, sent). Custom labels need an extra call to get their names and are left out for now.
- **Account** = the contact's email domain. Personal domains (gmail.com, yahoo.com, outlook.com) have no account (`accountId: null`).
- **recentActivity**: `received`/`sent` from messages. `status_changed` is never emitted: Gmail keeps no status history.

## Gaps (the design shows these, Gmail cannot supply them)

- School name: account `name` is the domain.
- Owner/assignee, plan, Stripe standing: left out by decision.
- Status history and case notes.
- `low` priority and an explicit `open` status.
- Custom label names.
- Attachments: name, size and type only, never the file.
