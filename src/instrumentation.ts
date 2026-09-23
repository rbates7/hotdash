/**
 * Intentionally a no-op on the coach-dashboard preview branch.
 *
 * Other branches use this hook to start the CRM SQLite sync scheduler, which
 * needs the native `better-sqlite3` module. The Grace coach dashboard is a
 * local, mock-data preview and has no server-side work to schedule, so
 * nothing is registered here — `pnpm dev` must boot without any native deps.
 */
export async function register() {}
