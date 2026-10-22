import { randomUUID } from "node:crypto"

import { authUrlFor } from "@/lib/crm/gmail/client"
import { jsonError } from "@/lib/crm/core/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const state = randomUUID()
    const url = authUrlFor(state)
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : ""
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": `crm_oauth_state=${state}; Path=/api/crm/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
      },
    })
  } catch (error) {
    return jsonError(error, "Failed to start Google authorization.")
  }
}
