import type { Db } from "@/lib/crm/db/client"
import { syncState, type SyncSource } from "@/lib/crm/db/schema"

/**
 * Records a successful run for a cursor-less source (Stripe, Supabase) so
 * Settings can show "Last synced …". Gmail writes its own row with a cursor.
 */
export async function markSourceSynced(
  db: Db,
  source: Exclude<SyncSource, "gmail">,
  at: Date = new Date()
) {
  await db.insert(syncState)
    .values({ source, cursor: null, lastSyncedAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: syncState.source,
      set: { lastSyncedAt: at, updatedAt: at },
    })
}
