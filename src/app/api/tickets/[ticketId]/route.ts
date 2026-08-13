import { jsonError } from "@/lib/agents/http"
import type { ChlkStatus } from "@/lib/agents/types"
import { getTicketMeta, upsertTicketMeta } from "@/lib/chlk/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TicketUpdateBody = {
  owner?: string
  chlkStatus?: ChlkStatus
  blockerReason?: string
  isPriorityOne?: boolean
  needsFounderDecision?: boolean
  founderDecisionNote?: string
}

const validStatuses: ChlkStatus[] = ["to_do", "in_progress", "blocked", "done"]

/**
 * GET /api/tickets/[ticketId]
 * Returns the Chlk metadata for one ticket, or 404 if not yet initialized.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params
    const meta = await getTicketMeta(ticketId)
    if (!meta) {
      return Response.json(
        { error: "Ticket not found.", code: "not_found" },
        { status: 404 }
      )
    }
    return Response.json(meta)
  } catch (error) {
    return jsonError(error, "Failed to get ticket metadata.")
  }
}

/**
 * PATCH /api/tickets/[ticketId]
 *
 * The primary endpoint for Chlk specialist bots to update their own card.
 * All fields are optional — only supplied fields are changed.
 *
 * Body (JSON):
 *   owner              string           which bot/agent owns the card
 *   chlkStatus         ChlkStatus       "to_do" | "in_progress" | "blocked" | "done"
 *   blockerReason      string           required/meaningful when chlkStatus="blocked"
 *   isPriorityOne      boolean          set to true to make this the #1 priority (unsets any other)
 *   needsFounderDecision boolean        flag this card as needing Rashad's decision
 *   founderDecisionNote  string         context for Rashad about the decision needed
 *
 * Returns the full updated ticket metadata.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params
    const body = (await request.json().catch(() => ({}))) as TicketUpdateBody

    if (
      body.chlkStatus !== undefined &&
      !validStatuses.includes(body.chlkStatus)
    ) {
      return Response.json(
        {
          error: `Invalid chlkStatus "${body.chlkStatus}". Must be one of: ${validStatuses.join(", ")}.`,
          code: "invalid_status",
        },
        { status: 400 }
      )
    }

    if (body.chlkStatus === "blocked" && !body.blockerReason?.trim()) {
      const existing = await getTicketMeta(ticketId)
      if (!existing?.blockerReason) {
        return Response.json(
          {
            error:
              'blockerReason is required when chlkStatus is "blocked". Describe what is blocking progress.',
            code: "missing_blocker_reason",
          },
          { status: 400 }
        )
      }
    }

    const updated = await upsertTicketMeta(ticketId, {
      owner: body.owner,
      chlkStatus: body.chlkStatus,
      blockerReason: body.blockerReason,
      isPriorityOne: body.isPriorityOne,
      needsFounderDecision: body.needsFounderDecision,
      founderDecisionNote: body.founderDecisionNote,
    })

    return Response.json(updated)
  } catch (error) {
    return jsonError(error, "Failed to update ticket metadata.")
  }
}
