import { getDb } from "@/lib/crm/db/client"
import { jsonError, refuseCrossSite } from "@/lib/crm/core/http"
import { disconnectGoogle } from "@/lib/crm/gmail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const refused = refuseCrossSite(request)
    if (refused) return refused
    await disconnectGoogle(getDb())
    return Response.json({ ok: true })
  } catch (error) {
    return jsonError(error, "Failed to disconnect Google.")
  }
}
