import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE, verifySession } from "@/lib/auth/cookie"

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"])

export default async function proxy(request: NextRequest) {
  // No APP_PASSWORD means the gate is deliberately disabled (local use).
  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.next()

  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const secret = process.env.APP_SECRET
  const cookie = request.cookies.get(SESSION_COOKIE)?.value
  if (secret && cookie && (await verifySession(cookie, secret))) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: "Authentication required.", code: "auth_required" },
      { status: 401 }
    )
  }
  const loginUrl = new URL("/login", request.url)
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
}
