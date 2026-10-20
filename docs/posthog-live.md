# Live PostHog (read-only)

Metrics reads usage figures from PostHog, the same way it reads Stripe
([stripe-live.md](stripe-live.md)): a server-only key, a 5-minute cache that
a request never waits for, and Not connected (no figure) whenever PostHog is
not connected.

## What PostHog holds — and so what these figures can say

- **iOS app events only, from June 2026.** Nothing from the web app,
  nothing earlier. Every PostHog-fed figure says "iOS app".
- **`user_registered` has no source**, so PostHog cannot count sign-ups
  honestly; there is no Sign-ups card. Funnels and activation need an agreed
  activation event first; not built.
- A "user" is a PostHog person (`person_id`): someone signed in on two
  phones is one person; someone who never signed in is their own anonymous
  person. PostHog does not know who is a coach, so the card says "Active
  Users", not "Active coaches".

## Cards PostHog feeds

| Card | Live definition |
| --- | --- |
| **Active Users** (an extra card: "Add metric") | People with **any** event in the last 28 days (rolling 28 × 24 h). Compared with the 28 days before; six windows charted. Under it: people active in the last 24 h and in the last 7 days. |
| **Retention** (default board) | Of the people active in the previous 28 days, the share also active in the latest 28 (`iOS app · 452 of 774 users came back`). When PostHog is not connected, this card says Not connected, with no figure. |

Windows are rolling 28 × 24 h ending at PostHog's `now()` at the sync, so
they have no time zone. A window that starts before PostHog's first event
(with a day's slack) has **no figure** — it charts as a gap and a headline
reads `—` with "PostHog has under 28 (or 56) days of app events" — never a
0. Retention with nobody in the base window reads `—`, "No app users in the
28 days before". Math: `src/lib/posthog-metrics.ts` (pure, unit-tested).

Every other Metrics card is Stripe's or says Not connected. The page notice
says which cards are live from Stripe and/or PostHog.

## Setup

| | |
| --- | --- |
| Project | PostHog project id **472613** ("CHLK iOS"), pinned as `CHLK_POSTHOG_PROJECT_ID` in `src/lib/server/posthog.ts`. Not an env var and not a secret. Moving to another project is a code change. |
| Env vars | `POSTHOG_READONLY_KEY` (project pinned in code: 472613, "CHLK iOS") — **server only**, never `NEXT_PUBLIC_`. The only PostHog variable. Unset → "not connected"; a key that is not `phx_…` → refused (not configured), nothing is sent. The project id is not a secret (it is in every PostHog URL), so it is pinned in `src/lib/server/posthog.ts` as `CHLK_POSTHOG_PROJECT_ID` rather than a second variable. |
| `POSTHOG_HOST` | Optional; default `https://us.posthog.com`. Set `https://eu.posthog.com` for an EU project. Only `https://` hosts under `posthog.com`, with no path, port or credentials, are accepted — anything else disables PostHog, so the key is never sent elsewhere. A loopback host (`http://127.0.0.1:<port>`) is for tests/mocks only and is refused in a production build unless `POSTHOG_ALLOW_MOCK_HOST=1`. |
| Key | A PostHog **personal API key** scoped to **this one project** with **Query: Read** only (PostHog › Settings › Personal API keys › scopes). No other scopes; no organization-wide access. |
| Calls | Only `POST /api/projects/:id/query/` with three fixed `HogQLQuery` SELECTs (`src/lib/server/posthog.ts`): `SPAN_HOGQL` (PostHog's clock and its first event in the last 196 days), `WINDOWS_HOGQL` (per 28-day window: people active, and how many were active again in the next window) and `RECENT_HOGQL` (people active in 24 h / 7 days). HogQL is SELECT-only; nothing from a request goes into a query; they return counts only — no person ids, emails or properties. Redirects are refused, each call is cut off at 60 s. |
| Cache | Exactly as Stripe: one sync per server process every 5 minutes, always **in the background** (single flight, handed to `after()`); a request gets the last good copy (`connected`, or `stale` after a failure), or `not_connected` at once on a cold start. A sync over 240 s (under the routes' 300 s `maxDuration`) is a failure; a failed sync retries 1 minute after it failed; the last good copy is kept. Logs name the error class only (`PosthogAuthError`, `PosthogRateLimited`, `NetworkError`, `SyncTimeout`, …) — never a message, key or project id. |

## Endpoints

- `GET /api/posthog/summary` → `{ status, lastSyncedAt, metrics }`; `status`
  is `connected`, `stale` (last good figures + `lastSyncedAt`) or
  `not_connected` (`metrics: null`). Never an error body.
- `GET /api/health/posthog` → `{"posthog":"ok"|"unavailable"|"not_configured"}`
  only. Same cache, safe to leave public.

## What each screen shows

| State | Retention / Active Users | Settings › Connected data › PostHog |
| --- | --- | --- |
| Loading | `–` placeholder | Checking… |
| Connected | PostHog's figure, no label | Connected · "Read-only · last synced <time>" |
| Stale | Last figure + "Last updated <time>" | "Last updated <time>" |
| Not connected | No figure: Not connected | Not connected |

Times use the shared clock in the Settings time zone.

## Checks

- `pnpm check:bundle` also scans client output for `POSTHOG_READONLY_KEY`
  (name, and value when set); CI builds with a dummy `phx_…` key and no
  project id.
- CI and Playwright run with `POSTHOG_READONLY_KEY`
  blank; `e2e/posthog-live.spec.ts` mocks
  `/api/posthog/summary` in the browser for connected and stale. Unit tests
  run the real `fetch` loader against a loopback mock. Nothing calls PostHog.
