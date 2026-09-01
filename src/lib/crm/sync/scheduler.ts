import { eq } from "drizzle-orm"

import { getDb, type Db } from "@/lib/crm/db/client"
import { oauthTokens, SYNC_SOURCES, type SyncSource } from "@/lib/crm/db/schema"
import { isSyncPaused } from "@/lib/crm/settings/server"

import { runSync } from "./runner"

const TICK_MS = 60_000

function intervalFor(source: SyncSource): number {
  const envKey = `SYNC_${source.toUpperCase()}_INTERVAL_SEC`
  const fallback = { gmail: 120, stripe: 900, supabase: 3600 }[source]
  const parsed = Number(process.env[envKey])
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : fallback) * 1000
}

// Unconfigured sources are skipped silently so sync_runs isn't spammed with
// "Not configured" rows every interval; manual refresh still reports it.
function isConfigured(db: Db, source: SyncSource): boolean {
  switch (source) {
    case "gmail":
      return (
        db
          .select({ provider: oauthTokens.provider })
          .from(oauthTokens)
          .where(eq(oauthTokens.provider, "google"))
          .get() !== undefined
      )
    case "stripe":
      return Boolean(process.env.STRIPE_API_KEY)
    case "supabase":
      return Boolean(process.env.SUPABASE_DB_URL)
  }
}

const globalStore = globalThis as unknown as {
  __hotdashScheduler?: { timer: NodeJS.Timeout; lastAttempt: Map<string, number> }
}

async function tick(lastAttempt: Map<string, number>) {
  try {
    const db = getDb()
    if (isSyncPaused(db)) return
    const now = Date.now()
    for (const source of SYNC_SOURCES) {
      const last = lastAttempt.get(source) ?? 0
      if (now - last < intervalFor(source)) continue
      if (!isConfigured(db, source)) continue
      lastAttempt.set(source, now)
      // Sequential on purpose: SQLite is single-writer.
      await runSync(db, source, "interval")
    }
  } catch (error) {
    // The scheduler loop must never take the process down.
    console.error("[sync-scheduler]", error)
  }
}

export function startScheduler() {
  if (globalStore.__hotdashScheduler) return
  const lastAttempt = new Map<string, number>()
  const timer = setInterval(() => {
    void tick(lastAttempt)
  }, TICK_MS)
  timer.unref()
  globalStore.__hotdashScheduler = { timer, lastAttempt }
  console.log(
    `[sync-scheduler] started (gmail ${intervalFor("gmail") / 1000}s, stripe ${
      intervalFor("stripe") / 1000
    }s, supabase ${intervalFor("supabase") / 1000}s)`
  )
}
