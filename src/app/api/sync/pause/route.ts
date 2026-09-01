import { z } from "zod"

import { jsonError } from "@/lib/core/http"
import { getDb } from "@/lib/db/client"
import { setSyncPaused } from "@/lib/settings/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ paused: z.boolean() })

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    setSyncPaused(getDb(), body.paused)
    return Response.json({ ok: true, paused: body.paused })
  } catch (error) {
    return jsonError(error, "Failed to update sync pause state.")
  }
}
