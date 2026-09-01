import { getDb } from "@/lib/crm/db/client"
import { jsonError } from "@/lib/crm/core/http"
import { disconnectGoogle } from "@/lib/crm/gmail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  try {
    await disconnectGoogle(getDb())
    return Response.json({ ok: true })
  } catch (error) {
    return jsonError(error, "Failed to disconnect Google.")
  }
}
