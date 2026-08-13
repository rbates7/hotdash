import { jsonError } from "@/lib/agents/http"
import {
  createCloudAgent,
  listCloudAgents,
  requireSession,
} from "@/lib/agents/server"
import type { CreateAgentInput } from "@/lib/agents/types"
import {
  getAllTicketMetas,
  getFounderStrip,
  mergeTicketMetasIntoCards,
} from "@/lib/chlk/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    const url = new URL(request.url)

    const [agentResult, metas, founderStrip] = await Promise.all([
      listCloudAgents(session.apiKey, {
        cursor: url.searchParams.get("cursor") ?? undefined,
        prUrl: url.searchParams.get("prUrl") ?? undefined,
        includeArchived: url.searchParams.get("includeArchived") === "true",
      }),
      getAllTicketMetas(),
      getFounderStrip(),
    ])

    mergeTicketMetasIntoCards(agentResult.agents, metas)

    return Response.json({ ...agentResult, founderStrip })
  } catch (error) {
    return jsonError(error, "Failed to list cloud agents.")
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    const body = (await request.json()) as CreateAgentInput
    return Response.json(await createCloudAgent(session.apiKey, body))
  } catch (error) {
    return jsonError(error, "Failed to create a cloud agent.")
  }
}
