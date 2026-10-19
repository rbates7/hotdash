import { after } from "next/server"

import { APP_STORE_NOT_CONNECTED, appStoreHealth, type AppStoreSummary } from "@/lib/app-store-summary"
import { appStoreSource } from "@/lib/server/app-store"

export const dynamic = "force-dynamic"

/**
 * `{"appStore":"ok"|"suspect_zero"|"stale"|"not_connected"}` and nothing
 * else — no count, no database URL, no error text — so it is safe to leave
 * public. `suspect_zero` is a read that answered 0 (likely RLS blocking the
 * read-only role). Reads through the same cache as the summary, so polling
 * it cannot hammer the database.
 */
export async function GET() {
  after(() => appStoreSource().settled?.())
  let reading: AppStoreSummary
  try {
    reading = await appStoreSource().read()
  } catch {
    reading = APP_STORE_NOT_CONNECTED
  }
  return Response.json({ appStore: appStoreHealth(reading) }, { headers: { "Cache-Control": "no-store" } })
}
