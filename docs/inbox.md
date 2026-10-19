# Inbox (`GET /api/inbox`)

The Workplace **Inbox** tab and Home's **Needs you** door read one
server endpoint, `GET /api/inbox`, so they always agree. It is read-only and
server-side: no token reaches the browser, the response never carries an
error message, and it never returns sample rows.

## Sources and what becomes a row

| Source | Where it comes from | Needs you (lit dot, on Home) | Informational (Inbox tab only) |
|---|---|---|---|
| **GitHub**: rbates7/hotdash pull requests | The #51 workboard service (`src/lib/server/workboard.ts`, `GITHUB_READONLY_TOKEN` or `github_read_only`). The Inbox reuses its cache and makes no extra GitHub calls. | PR **ready for review** | PR **needs a fix** (CI failing, changes requested or merge conflict). That's on the engineer, not the founder. |
| **Sentry**: org `chlk`, project `chlk-ios` | `src/lib/server/sentry.ts`: one `GET https://us.sentry.io/api/0/projects/chlk/chlk-ios/issues/?query=is:unresolved` (the org's region is `us.sentry.io`) | unresolved **error/fatal** issues that are **new**, **regressed** or **escalating** | other unresolved error/fatal issues seen in the **last 24 hours** ("Ongoing") |
| **Gmail** | stub | — | always **Not connected**. #46's Gmail source feeds the CRM only; Inbox wiring is a follow-up. |

Drafts, PRs whose CI is still running, merged PRs, Sentry warnings and
non-Sentry links never become rows. Rows are newest first. Home shows at most
five Needs-you rows plus a "N waiting" count; the Inbox tab lists every row,
informational ones included.

## Response

```json
{
  "fetchedAt": "2026-10-18T20:00:00.000Z",
  "sources": {
    "github": { "status": "connected", "fetchedAt": "2026-10-18T19:58:00.000Z" },
    "sentry": { "status": "stale", "fetchedAt": "2026-10-18T19:13:00.000Z" },
    "gmail":  { "status": "not_connected", "fetchedAt": null }
  },
  "items": [{ "id": "github-pr-912", "source": "github", "title": "PR ready for review", "snippet": "#912 …", "at": "…", "unread": true, "url": "https://github.com/…" }]
}
```

`Cache-Control: no-store`, `dynamic = "force-dynamic"` (never called at
build time), `maxDuration = 300`. If anything inside throws, the route answers
200 with every source `not_connected` and no rows.

## Status rules (the #50 connecting rule)

Each source is `connecting | connected | stale | not_connected`, and each one
fails on its own:

- **No token** (or a malformed one) is `not_connected`, never connecting.
- **connecting** only while a token is set and the *first* sync hasn't finished.
- A **failed first sync** is `not_connected`. A retry never goes back to connecting.
- A **failure after a good sync** is `stale`: the last good rows stay, with when they were fetched.

On screen, the overall status is connected if any source is connected, else
stale, else connecting, else not connected. Each stale source always gets
its own dated line, even next to a live one (e.g. "Sentry: Last updated Sun,
Oct 18 · 2:13 PM CDT"), using the shared `lastUpdatedLabel`. The connecting
copy names only the sources that are actually connecting. If the browser
can't reach `/api/inbox`, rows already shown stay with their live sources
marked stale; with nothing loaded yet, every source reads Not connected.

## Caching and timing

- Server: Sentry and GitHub each keep a **5-minute** last-good cache. After a
  failed sync they **retry after 1 minute**. A request never waits for a sync:
  it gets the copy there is, and a due sync runs after the response (`after()`).
  Each sync is time-limited.
- Browser: `useInboxView()` polls every **5 s** while a source is connecting, then every **60 s**. If our endpoint fails, it backs off.

## `SENTRY_READONLY_TOKEN`

- **Server only.** Set it in the environment (Vercel project env). Never in client code, never `NEXT_PUBLIC_`. `pnpm check:bundle` fails the build if its name or value shows up in client output.
- **Read-only scopes:** `project:read` and `event:read` (an org auth token `sntrys_…` or a user token), with access to org `chlk`, project `chlk-ios`. It needs no write or admin scopes.
- Format check: 32–600 characters from `A–Z a–z 0–9 _ + = / . -`. Anything else, such as whitespace, quotes or `:`, is treated as no token. CI's dummy token for the build and bundle check contains `:` on purpose, so a stray build-time read can't reach Sentry.
- Failures are logged as fixed words only: `[sentry] sync failed: SentryHttpError | InvalidData | SyncTimeout | UnknownError`. The token and response bodies are never logged.
- Without it, Sentry reads **Not connected** and contributes no rows.

## Tests

- Unit: `src/lib/inbox-sources.test.ts`, `src/lib/inbox-screen.test.ts`, `src/lib/server/{inbox,sentry}.test.ts`, `src/hooks/use-inbox.test.ts`, `src/app/api/inbox-routes.test.ts`, plus the Inbox panel and Home component tests.
- e2e: `e2e/inbox-live.spec.ts` checks the real server with no tokens and every state (mixed staleness included) at 390/820/1180/1440 in light and dark, with `expectReadable` and a no-sideways-scroll check. Review stills: `e2e/inbox-screens.spec.ts` (and `e2e/inbox-before-shots.spec.ts` for a base branch), both opt-in with `SCREENSHOTS=1`.
