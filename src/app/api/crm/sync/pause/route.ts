import { z } from "zod"

import { jsonError, refuseCrossSite } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { setSyncPaused } from "@/lib/crm/settings/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ paused: z.boolean() })

export async function POST(request: Request) {
  try {
    const refused = refuseCrossSite(request)
    if (refused) return refused
    const body = bodySchema.parse(await request.json())
    await setSyncPaused(getDb(), body.paused)
    return Response.json({ ok: true, paused: body.paused })
  } catch (error) {
    return jsonError(error, "Failed to update sync pause state.")
  }
}
