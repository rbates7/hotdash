// Starts the CRM's polling sync loop (Gmail/Stripe/Supabase) alongside the
// dev/prod server. Sources with no credentials are skipped silently, so this
// is a no-op until you connect Gmail from /crm/settings.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  if (process.env.DISABLE_SYNC_SCHEDULER) return
  const { startScheduler } = await import("@/lib/crm/sync/scheduler")
  startScheduler()
}
