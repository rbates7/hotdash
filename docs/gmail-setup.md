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
   `GMAIL_MAILBOX`), ticking **Production** and **Preview** → **Save** →
   **Deployments → ⋯ → Redeploy**.
7. **Check it.** Open `/api/health/gmail` on the site, wait a minute, reload:
   it says `{"gmail":"ok"}`. The CRM header now says **Live from Gmail**.

That's all. To switch it off later, delete the four variables in Vercel
(the CRM goes back to "Gmail not connected" and its sample) and, signed in
as info@chlkapp.com, remove **Chlk Dashboard** at
<https://myaccount.google.com/permissions>.

> **Before you do this: the dashboard has no sign-in.** Once Gmail is
> connected, anyone with the dashboard link can see the support inbox's
> senders, subjects and message previews (Google's ~200-character snippet;
> never full bodies or attachments). Your Oct 13 decision kept the dashboard
> public with real data; customer email is more sensitive than Stripe
> totals, so consider bringing sign-in back first.

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
| Cache | Same as Stripe: one sync per server process every 5 minutes, always **in the background** — a request never waits. It gets the last good copy (`connected`, or `stale` after a failure) while a due sync runs behind it, one at a time; on a cold start it gets `not_connected` at once and the next poll (60 s) picks up the sync. The routes hand the running sync to `after()`. A sync over 240 s is aborted (the signal reaches every `fetch`) and counts as a failure; a failed sync retries 1 minute after it failed. The last good copy is kept indefinitely. |
| Logs | `[gmail] sync failed: <kind>` — a fixed word (`GmailAuth`, `GmailApi`, `GmailRateLimited`, `InvalidData`, `SyncTimeout`, `Aborted`, `UnknownError`), never Google's text, never a credential. |
| Bundle check | `pnpm check:bundle` fails if any `GMAIL_*` secret's value, or any `GMAIL_*` env var name, is in client output. CI builds with dummy values. |

### Endpoints

- `GET /api/crm/gmail` → `{ status, lastSyncedAt, mailbox, data }`. `status`
  is `connected`, `stale` (Gmail failed; the last good rows and their
  `lastSyncedAt`) or `not_connected` (`data: null`). `data` is
  `{ organizations, contacts, cases, messages }` in the CRM's own shapes
  (`src/lib/crm/crm.ts`), checked with the CRM's guards before a copy is
  kept. Never an error body.
- `GET /api/health/gmail` → `{"gmail":"ok"|"error"|"not_configured"}` and
  nothing else. `error` covers a failed sync and the moment before the first
  one lands. Same cache, safe to leave public.

### How threads become CRM rows

`mapGmailThreads` (`src/lib/crm/gmail-mapping.ts`, pure, unit-tested):

- **Case**: a thread the inbox has replied in (or started), and any thread
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
| Not connected | The sample, saved in this browser, every row labelled | **Gmail not connected** + **Sample data** |
| Connected | The support inbox | **Live from Gmail**, "Read-only · edits here aren't saved" |
| Stale | The last good copy | **Last updated <time>** |

Settings › Connected data shows Gmail as Connected / Last updated / Not
connected. With Gmail live, the CRM's controls still work on the inbox's
rows in memory (Gmail is read-only and nothing is written back); the next
synced copy replaces them. The sample's saved edits stay untouched in this
browser for when Gmail is not connected.

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
