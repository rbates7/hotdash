# CRM setup

The CRM lives at `/crm` in this dashboard. It runs on demo data out of the
box; the three integrations below are optional and can be added whenever.

## Check your setup before you start

```bash
pnpm crm:doctor
```

Validates `.env.local` and names anything that would stop Gmail connecting —
including a redirect URI that doesn't match the route, which is the easiest
thing to get wrong. Run it after editing `.env.local` and before touching
the Google console.

## First run (no credentials)

```bash
pnpm install
pnpm crm:seed     # demo data: 6 contacts, 8 cases, 2 triage threads
pnpm dev
```

Open http://localhost:3000/crm. The Settings tab will show all three
integrations as "not configured", which is expected.

Data lives in a SQLite file at `data/crm.db` (gitignored). Re-run
`pnpm crm:seed` any time to wipe and reset it.

## 1. Google / Gmail — email-to-case

The CRM polls your mailbox read-only (`gmail.readonly`) and turns threads
from known contacts into cases.

1. https://console.cloud.google.com → create a project (e.g. `chlk-dashboard`).
2. **APIs & Services → Library** → "Gmail API" → **Enable**.
3. **OAuth consent screen**: choose **Internal** (your inbox is on Google
   Workspace, so this needs no verification and refresh tokens never
   expire). Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI:
   `http://localhost:3000/api/crm/google/callback`
   (add your deployed URL later if this ever leaves localhost).
5. Copy the client ID/secret into `.env.local`, and set `APP_SECRET`
   (`openssl rand -hex 32`) — it encrypts the stored Google tokens at rest.
   It must be at least 32 characters; anything shorter is rejected, because
   a short passphrase is brute-forceable against a copied database.
6. Run `pnpm crm:doctor` and fix anything it flags.
7. **CRM → Settings → Connect Google**, approve, then **Sync now**.

> **Sync Stripe before Gmail on the very first run.** Gmail only opens a case
> when the sender is already a known contact; everyone else waits in triage.
> Import customers from Stripe first and your existing customers' mail
> becomes cases immediately instead of arriving as a triage pile. The
> "sync all" endpoint enforces this order, but the per-source buttons do not.

> **Start narrow.** Set `GMAIL_INITIAL_SYNC_WINDOW=7d` for the first pass so
> the result is reviewable, then widen and go again. The sync is idempotent,
> so re-running never duplicates anything.
>
> A months-long backfill runs into Gmail's per-user rate limit. That is
> expected and handled: the client backs off and waits the window out, and
> messages are stored in chunks so a run that dies part way keeps what it
> already had. Re-running skips everything already stored, so a backfill that
> stopped is cheap to resume — just press **Backfill** again.
>
> Widening the window is **not** enough on its own: ordinary syncs resume from
> a stored history cursor and never re-read the window. After changing it,
> restart the server and use **Backfill** on the Settings page (or
> `POST /api/crm/sync/gmail?full=1`), which clears the cursor first. Plain
> "Sync now" will not reach back further.

Optional: `FOUNDER_ALIASES` for send-as addresses that also count as you,
and `GMAIL_INITIAL_SYNC_WINDOW` (default `30d`) for how far back the first
sync reaches. That window takes either a duration (`7d`, `8m`, `2y`) or an
absolute date (`2026-01-01`). Prefer a date when backfilling from a known
starting point — a duration drifts, so a later re-sync after a history gap
would reach further back than the first one did. `pnpm crm:doctor` prints the
Gmail query it resolves to.

### What the sync does

- Mail from a **known contact** → creates/updates a case, one per Gmail
  thread. Your replies land on the same timeline; inbound mail on a closed
  case reopens it with a note.
- Mail from an **unknown human** → waits in **Triage** (promote / link /
  ignore).
- **Contact-form notifications** (Squarespace, Typeform, a site's own mailer)
  are sent *by the form host*, not the person who filled the form in. The
  sender is resolved through `Reply-To`, falling back to the `Email:` field in
  the form body, so the case or triage entry belongs to the coach rather than
  to Squarespace. If your form carries neither, the message still reaches
  triage under the host's name rather than being dropped — an unattributed
  lead is fixable, a missing one is not. The case is titled from the form's
  message rather than its template subject, so a queue of submissions is
  readable at a glance.

  Cases created before this existed can be repaired in place from the message
  bodies already stored: `pnpm crm:repair-forms` reports what it would change,
  `pnpm crm:repair-forms --write` applies it. It never overwrites a name you
  edited by hand, and re-running it is a no-op.
- **Bulk mail** (List-Unsubscribe, Precedence, no-reply senders) from
  unknown senders → skipped entirely, so no Gmail filters are needed.
- Your own outbound threads with no case (investors, lawyers) → ignored.

## 2. Stripe — customers become contacts with plans

1. Stripe Dashboard → **Developers → API keys → Create restricted key**.
2. Grant **Customers: Read** and **Subscriptions: Read** only.
3. Set `STRIPE_API_KEY` in `.env.local`.
4. Map your price IDs to plan names in `src/lib/crm/stripe/plan-map.ts`.
5. **CRM → Settings → Stripe → Sync now**.

## 3. Supabase — name and organization enrichment

Optional. Enriches contacts that already exist; it never creates them.

1. Create a read-only role in the Supabase SQL editor:

   ```sql
   create role hotdash_ro login password '<strong password>';
   grant usage on schema public to hotdash_ro;
   grant select on public.users to hotdash_ro;
   ```

2. Edit the query in `src/lib/crm/supabase/mapping.ts` so it returns
   `email`, `first_name`, `last_name`, `org_name` from your real schema.
3. Set `SUPABASE_DB_URL` (use the **session pooler** string on IPv4-only
   networks) and hit **Sync now**.

Precedence when sources disagree: **manual edits > Supabase > Stripe >
Gmail**. Anything you type in the UI is never overwritten by a sync.

## Sync scheduling

While `pnpm dev` runs, an in-process scheduler polls Gmail every 2 min,
Stripe every 15 min, Supabase hourly (`SYNC_*_INTERVAL_SEC` to change).
Unconfigured sources are skipped silently. Pause it from CRM → Settings, or
set `DISABLE_SYNC_SCHEDULER=1` and use the Refresh buttons.

## Running it day to day

```
pnpm crm:restart   # pull, rebuild, start in the background, hand the terminal back
pnpm crm:logs      # follow the server log
pnpm crm:stop      # stop it
```

The server no longer holds the terminal that started it, so one window is
enough: run a command, get the prompt back. A restart replaces whatever was
running before, including a server started some other way on the same port.

Every restart first copies the database to `data/crm.db.bak`, because a
build can carry a migration and some migrations rebuild a table. To take a
copy by hand before something you might want to undo:

```
pnpm crm:backup                  # -> data/crm.db.bak
pnpm crm:backup data/before.db   # -> wherever you say
```

To go back to a backup:

```
pnpm crm:stop
cp data/crm.db.bak data/crm.db
rm -f data/crm.db-wal data/crm.db-shm
pnpm crm:restart
```

### What the pages do now

- **Overview** — five tiles (the fifth is cases waiting on your reply for
  over three days), then who started paying this week and who left, each
  with a "reached out" tick that remembers when you ticked it. "View all"
  opens the same list on Customers.
- **Customers** — every column sorts; filters for plan, status, when paying
  started or ended, open cases, and the school someone typed in. Asking for
  canceled people flips the view to Everyone.
- **Accounts** — staff accounts, or *Prospective*: schools where two or more
  coaches with no staff account typed the same name. Click one to see who.
- **Cases** — tick rows and "Close selected", or close one from its row.
  Nothing is deleted; a closed case reopens from its page. The Age column
  turns red when a reply is overdue.
- **A customer's page** — notes and logged calls about the person, kept
  separately from any one case, and the emails you started that have no
  reply yet.

**Reached out.** Mail you send counts as reaching out: a reply on a case,
or mail you start to someone the CRM knows (kept with the person, and
adopted into a case if they reply). The Overview's tick fills itself from
an email you sent or a call you logged on or after the event — paying
started, or the plan ending — and locks, since the record exists; tick it
yourself for a text or a chat. Customers has a "Last contacted" column
(the latest of an email you sent, a call you logged, or your tick) and a
"Never contacted" filter. Mail you started before the sync was keeping it
is not there until you import it once:

```
pnpm crm:sync gmail --sent
```

(or CRM → Settings → Gmail → Import sent mail). It reads only your sent
mail over `GMAIL_INITIAL_SYNC_WINDOW`, skips what is already stored, and
leaves the ordinary sync alone. Mail sent as a second address from the
same inbox counts once that address is in `FOUNDER_ALIASES`.

## Supabase enrichment

Optional, and independent of everything above. It fills in names, teams and
product usage for people who email you but are not the Stripe payer — on a
team account that is most of them, so Stripe alone cannot say who they are.

1. Supabase → Project Settings → Database → Connection string. Create a
   **read-only** role for this; the CRM only ever selects.
2. Put it in `.env.local` as `SUPABASE_DB_URL`.
3. `pnpm crm:schema` prints the tables and columns that role can see —
   column names only, never row data — and flags which tables carry an
   email to match contacts against.
4. Write that into `query` in `src/lib/crm/supabase/mapping.ts`, keeping the
   output column aliases exactly as documented there.
5. **Let the role through row-level security.** Supabase enables RLS on app
   tables, and a role with no policy sees zero rows and no error — the sync
   reports success and enriches nobody. Add a read policy for each table the
   query touches:

   ```sql
   create policy crm_reader_read on chlk.profiles         for select to crm_reader using (true);
   create policy crm_reader_read on chlk.organizations    for select to crm_reader using (true);
   create policy crm_reader_read on chlk.staff_seat_codes for select to crm_reader using (true);
   ```

   `pnpm crm:schema` cannot detect this — table structure is visible even
   when rows are not — so if a sync comes back with "Query returned no rows",
   this is the first thing to check.
6. Sync from **CRM → Settings**. Manually edited names always win; Stripe
   and Supabase fill in the rest.

**What makes someone a "Team".** Being on a staff account, which Chlk
records two ways: a seat in `chlk.staff_seat_codes` (as purchaser or
redeemer), or a profile attached to a row in `chlk.organizations` — those
rows are created deliberately for invoiced accounts, not per signup. The
school name someone typed into their profile is neither; it is kept on the
profile as *School / team (as entered)* and never creates an account. A seat
account is named after the purchaser's organization when there is one,
otherwise after the purchaser; an organization-linked account after the
organization.

Links the sync makes it may also change or remove when the upstream answer
changes; a link made by hand on a customer's profile is never touched by a
sync. Accounts nobody is on are removed at the end of each run.

### In-app feedback

Feedback sent from the form inside the Chlk app becomes cases — the words
and the chance-to-recommend score — so it sits in the same queue as email
and counts as needing a reply. It reads `chlk.feedback` over the same
`SUPABASE_DB_URL` and runs on the schedule with the rest (every 15 minutes,
`SYNC_FEEDBACK_INTERVAL_SEC`; `SUPABASE_FEEDBACK=0` leaves it to Sync now
only).

1. Let the read-only role see the table, in the Supabase SQL editor:

   ```sql
   grant select on chlk.feedback to crm_reader;
   create policy crm_reader_read on chlk.feedback for select to crm_reader using (true);
   ```

2. **CRM → Settings → In-app feedback → Sync now**, or `pnpm crm:sync
   feedback`. Each submission becomes one case with an "App" badge, titled
   "Rated 8 · " and the first words they wrote, or just "Rated 8" when they
   left only a score. Running it again changes nothing. "Query returned no
   rows" means the policy above is missing.

The email on the form is matched to a contact, or a contact is created for
it; the name comes from their Chlk profile when the emails match. The
score is shown as given until its scale is confirmed.

### Apple subscriptions

The CRM learns who is paying from Stripe, so a coach who bought through the
App Store looks like they never paid and is hidden by the Active view.
`pnpm crm:subscriptions` prints how big that gap is — counts only, never a
row of customer data — after this in the Supabase SQL editor:

```sql
grant select on chlk.subscriptions, chlk.plans to crm_reader;
create policy crm_reader_read on chlk.subscriptions for select to crm_reader using (true);
create policy crm_reader_read on chlk.plans         for select to crm_reader using (true);
```

Nothing changes in the CRM until a later round decides how Apple
subscriptions should count.

**Who gets added.** By default the sync creates a contact for anyone on a
staff account who is not in the CRM yet — otherwise an account set up by hand
shows none of its people, and a staff member's first email lands in triage as
a stranger. `SUPABASE_CREATE_CONTACTS=all` adds every profile with an email
(Customers defaults to paying people, so they stay out of the way);
`none` fills in existing contacts only.
