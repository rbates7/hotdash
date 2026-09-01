import { randomUUID } from "node:crypto"

import { authUrlFor } from "@/lib/crm/gmail/client"
import { jsonError } from "@/lib/crm/core/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const state = randomUUID()
    const url = authUrlFor(state)
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": `hd_oauth_state=${state}; Path=/api/crm/google; HttpOnly; SameSite=Lax; Max-Age=600`,
      },
    })
  } catch (error) {
    return jsonError(error, "Failed to start Google authorization.")
  }
}
