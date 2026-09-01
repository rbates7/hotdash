import { getDb } from "@/lib/crm/db/client"
import { handleOAuthCallback } from "@/lib/crm/gmail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CLEAR_STATE_COOKIE =
  "hd_oauth_state=; Path=/api/crm/google; HttpOnly; SameSite=Lax; Max-Age=0"

function redirectToSettings(origin: string, error?: string) {
  const url = new URL("/crm/settings", origin)
  if (error) url.searchParams.set("google_error", error)
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Set-Cookie": CLEAR_STATE_COOKIE },
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
  const { searchParams, origin } = new URL(request.url)
  try {
    const oauthError = searchParams.get("error")
    if (oauthError) return redirectToSettings(origin, oauthError)

    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const expectedState = readCookie(request, "hd_oauth_state")
    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectToSettings(origin, "Authorization state mismatch.")
    }

    await handleOAuthCallback(getDb(), code)
    return redirectToSettings(origin)
  } catch (error) {
    console.error(error)
    return redirectToSettings(
      origin,
      error instanceof Error ? error.message : "Authorization failed."
    )
  }
}
