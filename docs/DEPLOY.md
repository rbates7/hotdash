# Deploying

hotdash is deploy-ready but no target is picked yet. It's a single-user app
with a SQLite file and an in-process sync scheduler, which makes some hosts
a much better fit than others.

Non-negotiables anywhere:

- Set `APP_PASSWORD` and `APP_SECRET` (the gate is off when the password is
  empty — never expose it that way).
- Serve over HTTPS (the session cookie is marked Secure behind a proxy that
  sets `x-forwarded-proto`).
- Add the production callback URL
  (`https://<your-domain>/api/google/callback`) to the Google OAuth client
  **and** set `GOOGLE_REDIRECT_URI` to it.
- Persist and back up the SQLite file (`DATABASE_PATH`); it holds every
  case, note, and the encrypted Google tokens.

## Option A — a VPS or Docker host (best fit)

Anything that runs one long-lived Node process with a persistent disk:
Fly.io with a volume, Hetzner/DigitalOcean + Docker or systemd, a home
server.

- Works exactly as it does locally: SQLite on disk, scheduler in-process.
- `pnpm build && pnpm start`, put Caddy/nginx in front for TLS.
- Point `DATABASE_PATH` at the mounted volume; back that file up
  (`sqlite3 hotdash.db ".backup backup.db"` or litestream).

## Option B — Railway / Render

Same shape as Option A when you attach their persistent disk. Confirm the
disk survives deploys, and keep a single instance — SQLite is
single-writer and the scheduler must not run twice.

## Option C — Vercel (most changes)

Serverless breaks both core assumptions; migrating means:

1. **Database**: SQLite → hosted Postgres (Neon/Supabase) or Turso. The
   schema was written Postgres-portable (text ids, integer timestamps,
   JSON-as-text), so the move is mechanical: swap the Drizzle driver in
   `src/lib/db/client.ts`, regenerate migrations with the `postgres`
   dialect, and replace the two raw-SQL spots (counter increment, seed
   wipe).
2. **Scheduler**: set `DISABLE_SYNC_SCHEDULER=1` and add a Vercel Cron job
   hitting `POST /api/sync/all` on your interval (send the session cookie,
   or add a bearer-token check to that route first).
3. Keep functions in one region near the database.

Recommendation: don't pay that cost until something forces it — Option A is
the natural home for this app.
