# Dashboard login gate

One email plus one password locks the whole dashboard. Approved by Rashad via Coulson, Mon Oct 19 2026, 7:17 PM CT; GO to build from Simmons at the same time, fail-closed confirmed. Plan: [plans/dashboard-gate-plan.md](plans/dashboard-gate-plan.md).

## Settings (names only; never commit or paste a value)

| Name | What it is |
|---|---|
| `DASHBOARD_LOGIN_EMAIL` | The one email that can sign in. Matched trimmed and case-insensitive. |
| `DASHBOARD_GATE_SECRET` | The password, and the key that signs the sign-in cookie. |

| Settings | Result |
|---|---|
| Neither set | Gate off. Everything is open (local dev, CI, the default Playwright suite). |
| Both set | Gate on. |
| Only one set | Fails closed: every page and API stays locked and `/unlock` says sign-in is misconfigured. The server logs which *name* is missing, never a value. |

Values are set in Vercel through Coulson with Rashad's OK. Agents never set them.

## What it does

- `src/proxy.ts` (Next 16's middleware) runs on every request except Next's own assets and the favicon (#38's matcher), so new routes are locked by default.
- A page without a valid cookie → **307** to `/unlock?next=<path>`. `next` must be a same-origin relative path; anything else (other hosts, `//`, `/\`, dot-segment or encoded tricks) lands on `/home`.
- `/api/*` without a valid cookie → **401** JSON. Health routes (`/api/health/*`) are locked too.
- Open while locked: `/unlock`, `POST /api/gate/login`, `POST /api/gate/logout`, and root static files like `/icon.svg`. `/unlock` renders without the sidebar and header.
- Login: email and password are each compared in constant time, both always checked. A wrong login gets one generic message. After 5 wrong tries from one IP in 15 minutes that IP is refused for a while (in memory, per server instance; a cold start resets it).
- Cookie `hotdash_gate`: `v1.<expiry>.<HMAC-SHA256>`, httpOnly, Secure, SameSite=Lax, 7 days. Changing the password, the email, or the version (`COOKIE_VERSION` in `src/lib/gate/cookie.ts`) signs everyone out.
- Logout: `POST /api/gate/logout` clears the cookie and goes to `/unlock`. Cross-site posts to login or logout are refused.

## Rollback

1. Instant: clear **both** settings in Vercel and redeploy. (Clearing only one keeps it locked, on purpose.)
2. Full: revert the PR.

## Tests

- Unit (both time zones): `src/lib/gate/gate.test.ts`, `src/proxy.test.ts`, `src/app/api/gate/gate-routes.test.ts`.
- Opt-in Playwright: `e2e/dashboard-gate.spec.ts` (skipped unless `GATE_E2E=1`; see its header for running it against a server with throwaway test values).
- `pnpm check:bundle` fails if either name or (when set) value reaches client code. CI builds and scans with dummy values; the Playwright step blanks both so the main suite runs with the gate off.
