import { randomUUID } from "node:crypto"

import { authUrlFor } from "@/lib/crm/gmail/client"
import { jsonError } from "@/lib/crm/core/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isSecureRequest(request: Request) {
  const proto = request.headers.get("x-forwarded-proto")
  if (proto) return proto.split(",")[0]!.trim() === "https"
  return new URL(request.url).protocol === "https:"
}

export async function GET(request: Request) {
  try {
    const state = randomUUID()
    const url = authUrlFor(state)
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": [
          `hd_oauth_state=${state}`,
          "Path=/api/crm/google",
          "HttpOnly",
          "SameSite=Lax",
          "Max-Age=600",
          isSecureRequest(request) ? "Secure" : "",
        ]
          .filter(Boolean)
          .join("; "),
      },
    })
  } catch (error) {
    return jsonError(error, "Failed to start Google authorization.")
  }
}
