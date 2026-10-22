import { z } from "zod"

import { jsonError, refuseCrossSite } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { runSync } from "@/lib/crm/sync/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const paramsSchema = z.object({
  source: z.enum(["gmail", "stripe", "supabase", "all"]),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  try {
    const refused = refuseCrossSite(request)
    if (refused) return refused
    const { source } = paramsSchema.parse(await params)
    const fullGmailResync =
      new URL(request.url).searchParams.get("full") === "1"
    const db = getDb()
    if (source === "all") {
      // Contacts must exist before Gmail classifies known senders, and Chlk
      // profile data should enrich the resulting contact set last.
      const results = []
      for (const nextSource of ["stripe", "gmail", "supabase"] as const) {
        results.push(
          await runSync(db, nextSource, "manual", {
            fullGmailResync: nextSource === "gmail" && fullGmailResync,
          })
        )
      }
      return Response.json(
        { results },
        { status: results.some((result) => result.status === "error") ? 500 : 200 }
      )
    }
    const result = await runSync(db, source, "manual", {
      fullGmailResync: source === "gmail" && fullGmailResync,
    })
    return Response.json(result, {
      status: result.status === "error" ? 500 : 200,
    })
  } catch (error) {
    return jsonError(error, "Failed to run sync.")
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return Response.json(
        { error: "CRON_SECRET is not configured." },
        { status: 503 }
      )
    }
    const bearerMatches =
      request.headers.get("authorization") === `Bearer ${secret}`
    const manualSecretMatches =
      request.headers.get("x-crm-cron-secret") === secret
    if (!bearerMatches && !manualSecretMatches) {
      return Response.json({ error: "Unauthorized." }, { status: 401 })
    }
    const { source } = paramsSchema.parse(await params)
    const fullGmailResync =
      new URL(request.url).searchParams.get("full") === "1"
    if (source === "all") {
      return Response.json(
        { error: "Cron requests must target one source." },
        { status: 400 }
      )
    }
    const result = await runSync(getDb(), source, "interval", {
      fullGmailResync: source === "gmail" && fullGmailResync,
    })
    return Response.json(result, {
      status: result.status === "error" ? 500 : 200,
    })
  } catch (error) {
    return jsonError(error, "Failed to run sync.")
  }
}
