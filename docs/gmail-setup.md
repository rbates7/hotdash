# Gmail for the CRM (read-only)

## Rashad's steps

About 15 minutes, once. You need a Chlk Google Workspace login that can
create a Google Cloud project, the info@chlkapp.com password, and Vercel.

1. **Create a project.** Go to <https://console.cloud.google.com>, signed in
   with your chlkapp.com account. Project picker (top left) → **New project**
   → name it `Chlk Dashboard` → organization **chlkapp.com** → **Create**.
2. **Turn on the Gmail API.** In that project: **APIs & Services → Library**
   → search **Gmail API** → **Enable**.
3. **Consent screen: Internal.** **Google Auth Platform** (older consoles:
   **APIs & Services → OAuth consent screen**) → **Get started** → app name
   `Chlk Dashboard`, support email yours → **Audience: Internal** → contact
   email yours → agree → **Create**. Internal means only chlkapp.com accounts
   can use it, so Google does not need to review it.
4. **Make a Desktop app client.** **Google Auth Platform → Clients → Create
   client** → Application type **Desktop app** → name `Dashboard consent` →
   **Create**. Keep the window open: you need the **Client ID** and
   **Client secret** next.
5. **Run the consent script once.** On your computer, in the hotdash folder:
   `pnpm gmail:consent`. Paste the Client ID, then the Client secret (it
   stays hidden as you paste). A browser opens: **sign in as
   info@chlkapp.com** and click **Allow**. The terminal prints four lines.
6. **Paste the four lines into Vercel.** Vercel → the hotdash project →
   **Settings → Environment Variables** → add each one
   (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`,
   `GMAIL_MAILBOX`), ticking **Production** and **Preview** (leave
   **Development** unticked) → **Save** → **Deployments → ⋯ → Redeploy**
   the production deployment. Preview deployments pick the variables up on
   their next deploy.
7. **Check it.** Open `/api/health/gmail` on the site, wait a minute, reload:
   it says `{"gmail":"ok"}` (`"connecting"` while the first sync runs). The
   CRM header now says **Live from Gmail**.

That's all. To switch it off later, delete the four variables in Vercel
(the CRM goes back to "Gmail not connected": a Not connected panel, and only
the founder's own contacts) and, signed in
as info@chlkapp.com, remove **Chlk Dashboard** at
<https://myaccount.google.com/permissions>.

> **The dashboard has no sign-in, and customer emails are shown publicly.**
> Once Gmail is connected, anyone with the dashboard link can see the
> support inbox's senders, subjects and message previews (Google's
> ~200-character snippet; never full bodies or attachments). This is
> Rashad's decision, Oct 16, 9:45 PM CT: "Yes, show the customer emails
> publicly." It follows his Oct 13 decision to keep the dashboard public
> with real data. Preview links show the same emails: the variables are on
> Production and Preview, per Rashad's Oct 18, 7:50 PM CT "ship
> everything" (to Coulson).

### If something goes wrong

| What you see | What to do |
| --- | --- |
| Step 3 has no **Internal** option | The project is not in the chlkapp.com organization. Make a new one in step 1 and pick **chlkapp.com** as its organization. |
| The script says "You signed in as … not info@chlkapp.com" | Run it again and pick info@chlkapp.com on Google's page. |
| The script says Google sent no refresh token | Signed in as info@chlkapp.com, remove **Chlk Dashboard** at <https://myaccount.google.com/permissions>, then run it again. |
| info@chlkapp.com is a group or an alias, not a mailbox you can sign in to | Run the script with the real mailbox that receives the mail: `pnpm gmail:consent -- --mailbox that@chlkapp.com`, and paste the `GMAIL_MAILBOX` it prints. |
| `/api/health/gmail` stays `error` | The token was revoked, the Gmail API is off, or `GMAIL_MAILBOX` is not the account that clicked Allow. Repeat steps 5–6. |

---

## For engineers

| | |
| --- | --- |
| Env vars | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` — **server only**, never `NEXT_PUBLIC_`. `GMAIL_MAILBOX` (not secret, shown in the CRM) defaults to `info@chlkapp.com`. None set: not connected. Some set, or any malformed (client ID must end `.apps.googleusercontent.com`; no whitespace): not connected, and nothing is sent. |
| Scope | `https://www.googleapis.com/auth/gmail.readonly` only. |
| Calls | Plain `fetch`, no SDK (`src/lib/server/gmail.ts`, `server-only`): `POST oauth2.googleapis.com/token` (refresh-token grant) → `GET gmail.googleapis.com/gmail/v1/users/{GMAIL_MAILBOX}/threads?maxResults=100&q=newer_than:90d -category:promotions -category:social` → per thread `GET …/threads/{id}?format=metadata&metadataHeaders=From,To,Subject` (5 at a time). Headers, labels and snippets only — never a body or attachment. Gmail refuses a `{mailbox}` that is not the account that granted the token, so the mailbox cannot be swapped for another. |
| Cache | Same as Stripe: one sync per server process every 5 minutes, always **in the background** — a request never waits. It gets the last good copy (`connected`, or `stale` after a failure) while a due sync runs behind it, one at a time; on a cold start with credentials it gets `connecting` at once (the CRM says Connecting… over its skeletons, never invented rows) and polls every 5 s until the sync lands. This is the Stripe rule (#50): a failed or timed-out first sync is `not_connected`, every retry after it is too until one lands, and with no credentials it is always `not_connected`. The routes hand the running sync to `after()`. A sync over 240 s is aborted (the signal reaches every `fetch`) and counts as a failure; a failed sync retries 1 minute after it failed. The last good copy is kept indefinitely. |
| Filters | `skipReason` in `src/lib/crm/gmail-mapping.ts` drops whole threads before mapping, so they make no case, contact, triage row or message: **bounces** (mailer-daemon, postmaster, "Mail Delivery Subsystem", "Undeliverable", "Address not found" …), **billing and failed-payment notices** (from a billing sender such as Stripe or `billing@`, or opened by the mailbox with billing wording such as "we weren't able to charge" or "your free trial of", together with any customer reply to one, because the notice's greeting carries the customer's name), and **outbound-only threads** (the mailbox wrote and no customer replied). |
| Access token | One per server instance, shared by every request (`createTokenCache` in `src/lib/server/gmail.ts`): reused until 1 minute before Google's `expires_in`, at most one refresh in flight (callers that arrive meanwhile wait for it), dropped when Gmail answers 401, never reused for other credentials, and never cached when Google sends no `expires_in`. A failed refresh is not cached. Each Vercel instance still refreshes on its own; see "Sharing the access token across instances" below. |
| Logs | `[gmail] sync failed: <kind>` — a fixed word (`GmailAuth`, `GmailApi`, `GmailRateLimited`, `InvalidData`, `SyncTimeout`, `Aborted`, `UnknownError`) — and, when Google answered with an error, its **code fields only** in brackets: which call (`token` or `api`), the HTTP `status`, the OAuth `error` (e.g. `invalid_grant`, `unauthorized_client`), and the Gmail API `apiStatus` / `reason` (e.g. `PERMISSION_DENIED`, `userRateLimitExceeded`, `insufficientPermissions`). Values are kept only if they look like a code (letters and underscores) and contain no configured credential; `error_description`, `message`, bodies and headers are never read into the log. The bracket starts with **invalid token or grant** (`GmailAuth`), **rate limited** (`GmailRateLimited`) or **Gmail API error** (`GmailApi`), e.g. `[gmail] sync failed: GmailAuth (invalid token or grant: token status=400 error=invalid_grant)` or `[gmail] sync failed: GmailRateLimited (rate limited: api status=403 reason=userRateLimitExceeded)`. A 403 with a quota reason (`rateLimitExceeded`, `userRateLimitExceeded`, `quotaExceeded`, `dailyLimitExceeded`) or `RESOURCE_EXHAUSTED`, and any 429, is `GmailRateLimited`; other 401/403s are `GmailAuth`. |
| Bundle check | `pnpm check:bundle` fails if any `GMAIL_*` secret's value, or any `GMAIL_*` env var name, is in client output. CI builds with dummy values. |

### Endpoints

- `GET /api/crm/gmail` → `{ status, lastSyncedAt, mailbox, data }`. `status`
  is `connected`, `stale` (Gmail failed; the last good rows and their
  `lastSyncedAt`), `connecting` (credentials set, first sync running;
  `data: null`) or `not_connected` (`data: null`). `data` is
  `{ organizations, contacts, cases, messages }` in the CRM's own shapes
  (`src/lib/crm/crm.ts`), checked with the CRM's guards before a copy is
  kept. Never an error body.
- `GET /api/health/gmail` → `{"gmail":"ok"|"connecting"|"error"|"not_configured"}` and
  nothing else. `connecting` is the moment before the first sync lands;
  `error` is a failed sync. Same cache, safe to leave public.

### Sharing the access token across instances

The access-token cache lives in one server instance's memory, so on Vercel
each warm instance does its own refresh (still at most one at a time, then
reused for about an hour). The repo has no server-side shared store today,
so this PR adds none, and no env vars. If refreshes from many instances
ever matter (Google rate-limiting the token endpoint, say), the place to
share the token is a server-only store with a TTL: Vercel's Runtime Cache,
or a KV/Redis store, keyed by a hash of the client ID and refresh token
(never the token itself as a key), holding the access token until
`expires_in` minus the margin, behind the same `TokenCache` interface. That
would be new infrastructure and is a separate decision.

### How threads become CRM rows

`mapGmailThreads` (`src/lib/crm/gmail-mapping.ts`, pure, unit-tested):

- **Dropped first** (`skipReason`): bounces, billing and failed-payment
  notices, and outbound-only threads; see Filters above.
- **Case**: a thread the inbox has replied in (or started and a customer
  answered), and any thread
  from a sender it has replied to. One case per thread. Status replays the
  CRM's `transitionOnMessage` over the messages (new → waiting after a reply
  → open on the next inbound); archived after the customer wrote is
  `closed`. Starred is `high` priority, else `normal`.
- **Contact**: that sender, named from their From header (`nameSource:
  gmail`), with an organization per email domain (none for gmail.com,
  yahoo.com, outlook.com).
- **Triage**: threads from senders the inbox has never replied to —
  `pending` while in the inbox, `ignored` once archived.
- **Message**: one per non-draft message; outbound when labelled `SENT` or
  sent from the mailbox. Its text is Gmail's snippet (HTML entities decoded).
- Numbers: case and thread numbers are assigned first-seen per server
  process, oldest first, so a case keeps its number between syncs.

### What the CRM shows

| State | Rows | Header |
| --- | --- | --- |
| Loading (first paint) | Skeletons | — |
| Connecting (first sync on the server) | Skeletons, never invented rows | **Connecting…** |
| Not connected | A Not connected panel on Overview, Cases and Triage; Contacts shows it above the contacts the founder added (saved in this browser) | **Gmail not connected** |
| Connected | The support inbox | **Live from Gmail**, "Read-only · edits here aren't saved" |
| Stale | The last good copy | **Last updated <time>** |

Settings › Connected data shows Gmail as Connected / Last updated / Connecting… / Not
connected. With Gmail live, the CRM's controls still work on the inbox's
rows in memory (Gmail is read-only and nothing is written back); the next
synced copy replaces them. Contacts the founder added while Gmail was not
connected stay untouched in this browser for when it is not connected again.

### Tests

- Unit: `src/lib/crm/gmail-mapping.test.ts`, `src/lib/crm/gmail-summary.test.ts`,
  `src/lib/server/gmail.test.ts` (config, the REST calls against a fake
  `fetch`, cache, stale, timeout, no secret in logs), `src/app/api/gmail-routes.test.ts`,
  `src/components/crm/crm-gmail.test.tsx`.
- e2e: `e2e/crm-gmail.spec.ts` — the real server with no credentials (not
  connected), and `/api/crm/gmail` mocked in the browser for connected and
  stale. e2e never reaches Gmail.
- Screens: `pnpm build && pnpm screens:crm-gmail` (writes to
  `SCREENSHOT_DIR`, default `test-results/crm-gmail-shots`).
