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

export async function isSyncPaused(db: Db): Promise<boolean> {
  return (await getSetting(db, "sync_paused")) === "true"
}

export async function setSyncPaused(db: Db, paused: boolean) {
  await setSetting(db, "sync_paused", paused ? "true" : "false")
}
