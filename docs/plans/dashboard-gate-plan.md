# Dashboard access gate — plan (as shipped in #64)

*Originally drafted as a plan only against develop `cb1619f` (Oct 19, 2026), with a shared-password Option A. This copy is adjusted to the design that was approved and built: **one email plus one password**. Behaviour details live in [docs/dashboard-gate.md](../dashboard-gate.md).*

## Approval

- Approved by Rashad via Coulson, Mon Oct 19 2026, 7:17 PM CT
- GO to build: Simmons, Mon Oct 19 2026, 7:17 PM CT (same time). Fail-closed behaviour (only one setting set → everything locked) confirmed.
- Not approved by this: setting either value in Vercel, or shipping to production. Both still need Rashad's OK through Coulson.

---

## For Rashad (plain English)

Before this, anyone with `https://chlk-dev-board.vercel.app` could open every page **and** call the `/api/…` endpoints that serve customer emails (Gmail), Stripe numbers, PostHog usage, GitHub PRs and Sentry crash titles. You rolled back a full sign-in lock on Oct 13 (#39), with the rule that sign-in must come back before anyone else gets access.

**What ships:** one sign-in page. You type one email and one password; the site remembers you for a week. Not Google, no invites, no roles, no Settings › Account. Just a door on the whole dashboard.

**Still your call:** set the two settings in Vercel through Coulson (names below; never a value in chat or a PR), and approve production separately.

---

## Design (changed from the draft's Option A)

| | Draft Option A | Shipped |
|---|---|---|
| Sign-in | One shared password | One email + one password |
| Settings | `DASHBOARD_GATE_SECRET` | `DASHBOARD_LOGIN_EMAIL` + `DASHBOARD_GATE_SECRET` |
| Unset | Gate off | **Neither** set → gate off. **Only one** set → fail closed (locked, `/unlock` says misconfigured) |

`DASHBOARD_GATE_SECRET` is both the password and the HMAC key for the cookie (see follow-ups for splitting them). Old #38 names (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`) are not reused.

## Scope

### Locked (need the cookie)
- Every page (Home, Metrics, CRM, Inbox / Agent Workplace, Roadmap, Settings, …).
- Every `/api/*` route, including `/api/crm/gmail`, `/api/inbox`, `/api/stripe/*`, `/api/posthog/summary`, `/api/workboard`, `/api/notion/*`, and **`/api/health/*`** (locked by default; no external monitor uses them today).
- Signed-out page → 307 to `/unlock?next=…` (same-origin relative only, fallback `/home`). Signed-out `/api/*` → 401 JSON.

### Open
- `/unlock`, `POST /api/gate/login`, `POST /api/gate/logout`.
- Next assets (`/_next/*`, `favicon.ico`) and root static files (`*.svg`, …).
- No Vercel cron exists in this repo, so nothing to exempt.

### Out of scope
Google accounts, invites, roles, Settings › Account, Vercel Deployment Protection, token rotation, production ship.

## How it works

1. `src/proxy.ts` (Next 16's middleware) with #38's matcher: everything except `/_next/` and the favicon.
2. Neither setting → through. Only one → locked (fail closed).
3. Valid cookie (`v1.<exp>.<HMAC-SHA256>` over version, email and expiry; httpOnly, Secure, SameSite=Lax, 7 days) → through.
4. Else pages 307 to `/unlock?next=…`; `/api/*` 401.
5. Login: email (trimmed, case-insensitive) and password compared in constant time, both always checked; one generic error; 5 wrong tries per IP per 15 minutes, in memory per instance.
6. Logout: `POST /api/gate/logout` clears the cookie.
7. Changing the password, the email or the cookie version signs everyone out.

## CI and e2e

| Environment | Settings | Behaviour |
|---|---|---|
| GitHub Actions e2e | both blank | Gate off; the main suite is unchanged |
| CI build + bundle scan | obvious dummies | Proves neither name nor value reaches client JS |
| Local / screenshot servers | blank, or throwaway values only (`@example.invalid`, `TEST-ONLY-…`) | Opt-in gate e2e and stills |
| Preview / Production | set by Coulson with Rashad's OK | Gate on |

## Rollback
1. Instant: clear **both** settings in Vercel and redeploy (clearing one keeps it locked, on purpose).
2. Full: revert #64.

## Risks
| Risk | Mitigation |
|---|---|
| Password shared in Slack or a screenshot | Change `DASHBOARD_GATE_SECRET`; every cookie dies |
| Stolen cookie used to guess the password offline | Use a long random password now; separate signing key as a follow-up |
| Gate forgotten on Preview while Preview has real tokens | Set the same settings on Preview |
| Health locked breaks a future monitor | Small follow-up to make `/api/health/*` public |

## Follow-ups (not in #64)
- A separate random signing key, so the cookie is not keyed by the password.
- A narrow, explicit public allowlist of static files.
- A shared rate-limit store (KV) instead of per-instance memory.
- Health routes for external monitors (public, or with a monitor token), and tell whoever runs them.
- A logout button in the UI.
