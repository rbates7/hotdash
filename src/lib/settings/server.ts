import { eq } from "drizzle-orm"

import type { Db } from "@/lib/db/client"
import { settings } from "@/lib/db/schema"

export function getSetting(db: Db, key: string): string | null {
  return (
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  )
}

export function setSetting(db: Db, key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run()
}

export function isSyncPaused(db: Db): boolean {
  return getSetting(db, "sync_paused") === "true"
}

export function setSyncPaused(db: Db, paused: boolean) {
  setSetting(db, "sync_paused", paused ? "true" : "false")
}
