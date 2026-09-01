import { getDb } from "@/lib/db/client"
import { jsonError } from "@/lib/core/http"
import { disconnectGoogle } from "@/lib/gmail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  try {
    disconnectGoogle(getDb())
    return Response.json({ ok: true })
  } catch (error) {
    return jsonError(error, "Failed to disconnect Google.")
  }
}
