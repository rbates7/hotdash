import { jsonError } from "@/lib/agents/http"
import { getAllTicketMetas, getFounderStrip } from "@/lib/chlk/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/tickets
 * Returns all Chlk ticket metadata and the current FounderStrip summary.
 */
export async function GET() {
  try {
    const [metas, founderStrip] = await Promise.all([
      getAllTicketMetas(),
      getFounderStrip(),
    ])
    return Response.json({ tickets: metas, founderStrip })
  } catch (error) {
    return jsonError(error, "Failed to list Chlk tickets.")
  }
}
