import { logError } from "@/lib/crm/core/log"
import { getDb } from "@/lib/crm/db/client"
import { handleOAuthCallback } from "@/lib/crm/gmail/client"
import { GmailApiDisabledError } from "@/lib/crm/gmail/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CLEAR_STATE_COOKIE =
  "hd_oauth_state=; Path=/api/crm/google; HttpOnly; SameSite=Lax; Max-Age=0"

/** Fixed codes only — the value is rendered back on the settings page, and
 * arbitrary attacker text there reads as an official warning. */
type GoogleErrorCode =
  | "denied"
  | "state_mismatch"
  | "exchange_failed"
  | "api_disabled"

// Relative Location: deriving an absolute origin from the request host lets
// a spoofed Host header bounce the founder to an attacker origin.
function redirectToSettings(error?: GoogleErrorCode) {
  const path = error ? `/crm/settings?google_error=${error}` : "/crm/settings"
  return new Response(null, {
    status: 302,
    headers: { Location: path, "Set-Cookie": CLEAR_STATE_COOKIE },
  })
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? ""
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return rest.join("=")
  }
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  try {
    if (searchParams.get("error")) return redirectToSettings("denied")

    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const expectedState = readCookie(request, "hd_oauth_state")
    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectToSettings("state_mismatch")
    }

    await handleOAuthCallback(getDb(), code)
    return redirectToSettings()
  } catch (error) {
    logError("google-callback", error)
    if (error instanceof GmailApiDisabledError) {
      return redirectToSettings("api_disabled")
    }
    return redirectToSettings("exchange_failed")
  }
}
