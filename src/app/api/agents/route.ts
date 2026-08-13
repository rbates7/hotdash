import { jsonError } from "@/lib/agents/http"
import {
  createCloudAgent,
  listCloudAgents,
  requireSession,
} from "@/lib/agents/server"
import type { AgentCard, CreateAgentInput } from "@/lib/agents/types"
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

    // Synthesize AgentCard rows for Chlk-only tickets (no matching cloud agent).
    // This lets bot-* IDs (e.g. "bot-design") appear on the board.
    const cloudAgentIds = new Set(agentResult.agents.map((a) => a.id))
    const syntheticCards: AgentCard[] = metas
      .filter((meta) => !cloudAgentIds.has(meta.agentId))
      .map((meta) => ({
        id: meta.agentId,
        title: meta.owner ?? meta.agentId,
        status: "no_status",
        repository: "Chlk Bot",
        artifacts: [],
        owner: meta.owner,
        chlkStatus: meta.chlkStatus,
        blockerReason: meta.blockerReason,
        isPriorityOne: meta.isPriorityOne,
        needsFounderDecision: meta.needsFounderDecision,
        founderDecisionNote: meta.founderDecisionNote,
      }))

    const agents = [...syntheticCards, ...agentResult.agents]

    return Response.json({ ...agentResult, agents, founderStrip })
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
