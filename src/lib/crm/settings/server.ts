import { eq } from "drizzle-orm"

import type { Db } from "@/lib/crm/db/client"
import { settings } from "@/lib/crm/db/schema"

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1)
  return row?.value ?? null
}

export async function setSetting(db: Db, key: string, value: string) {
  await db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

export async function deleteSetting(db: Db, key: string) {
  await db.delete(settings).where(eq(settings.key, key))
}

function isConnectTimeout(error: unknown): boolean {
  const err = error as { code?: unknown; cause?: { code?: unknown } } | null
  return (err?.code ?? err?.cause?.code) === "CONNECT_TIMEOUT"
}

/**
 * First query of every cron run, so it is the one that meets a cold Neon
 * connection. One retry on CONNECT_TIMEOUT rides out a slow wake-up.
 */
export async function isSyncPaused(db: Db): Promise<boolean> {
  let value: string | null
  try {
    value = await getSetting(db, "sync_paused")
  } catch (error) {
    if (!isConnectTimeout(error)) throw error
    value = await getSetting(db, "sync_paused")
  }
  return value === "true"
}

export async function setSyncPaused(db: Db, paused: boolean) {
  await setSetting(db, "sync_paused", paused ? "true" : "false")
}
