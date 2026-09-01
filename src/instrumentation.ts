// In-process polling scheduler. It lives and dies with the Node server —
// perfect for `next dev` or a single long-running host, but it does not run
// on serverless platforms and must not run multi-instance (SQLite is
// single-writer). For those, set DISABLE_SYNC_SCHEDULER=1 and point an
// external cron at POST /api/sync/all instead (see docs/DEPLOY.md).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  if (process.env.DISABLE_SYNC_SCHEDULER) return
  const { startScheduler } = await import("@/lib/sync/scheduler")
  startScheduler()
}
