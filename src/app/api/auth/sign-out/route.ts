import { NextResponse, type NextRequest } from "next/server"

import { SIGN_IN_PATH } from "@/lib/auth/paths"
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session"

/**
 * POST clears the session cookie and lands on /sign-in (303, so the browser
 * follows with a GET). Public in the proxy: a signed-out POST is harmless.
 * Cross-site posts are refused so another site cannot sign you out.
 */
export function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== host)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 })
  }
  // No Origin header: fall back to Sec-Fetch-Site, which browsers always send.
  const fetchSite = request.headers.get("sec-fetch-site")
  if (!origin && fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 })
  }

  const response = NextResponse.redirect(new URL(SIGN_IN_PATH, request.url), 303)
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0))
  return response
}
