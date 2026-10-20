import { NextResponse } from "next/server"

import { GATE_COOKIE, gateCookieOptions } from "@/lib/gate/cookie"
import { UNLOCK_PATH } from "@/lib/gate/paths"
import { isSameOrigin } from "@/lib/gate/same-origin"

export const dynamic = "force-dynamic"

/** Clears this browser's gate cookie and goes to /unlock. POST only, same-origin. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 })
  const response = NextResponse.redirect(new URL(UNLOCK_PATH, request.url), 303)
  response.cookies.set(GATE_COOKIE, "", gateCookieOptions(0))
  return response
}
