import { NextResponse, type NextRequest } from "next/server"

/**
 * Origin check for CRM mutations.
 *
 * The dashboard has no authentication of its own, and Next only applies its
 * CSRF machinery to Server Actions — route handlers are unprotected. Without
 * this, any page the founder happens to have open could auto-submit a
 * cross-origin form and disconnect Gmail, pause syncing, or permanently
 * blacklist a customer's address. `Request.json()` ignores Content-Type, so
 * a `text/plain` form post reaches the JSON routes just fine.
 *
 * GET is left alone (nothing mutates), and same-origin requests always carry
 * a matching Origin on non-GET, so this costs nothing in normal use.
 */
export default function proxy(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return NextResponse.next()
  }

  const origin = request.headers.get("origin")
  const expected = request.nextUrl.origin

  if (origin && origin === expected) return NextResponse.next()

  // Same-origin fetches from our own pages always send Origin; treat the
  // fetch-metadata header as a secondary signal for clients that don't.
  if (!origin && request.headers.get("sec-fetch-site") === "same-origin") {
    return NextResponse.next()
  }

  return Response.json(
    { error: "Cross-origin request refused.", code: "bad_origin" },
    { status: 403 }
  )
}

export const config = {
  matcher: ["/api/crm/:path*"],
}
