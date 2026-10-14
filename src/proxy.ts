import { NextResponse, type NextRequest } from "next/server"

import { getAuthConfig } from "@/lib/auth/config"
import { HOME_PATH, SIGN_IN_PATH, SIGN_OUT_PATH } from "@/lib/auth/paths"
import { DEFAULT_NEXT, safeNext } from "@/lib/auth/safe-next"
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session"

/**
 * The sign-in lock. Next 16 renamed `middleware.ts` to `proxy.ts`; this is
 * that file. It runs before every page and API route (see `config.matcher`):
 *
 * - signed in → through
 * - signed out page → 307 to /sign-in?next=<path>
 * - signed out /api/* → 401 JSON
 *
 * Signed in on /sign-in → Home. Only the paths in isPublicPath() skip the
 * check. Server Functions still verify the session themselves (see
 * lib/auth/server.ts) rather than relying on this alone.
 */

/** Auth endpoints that must answer signed-out requests. */
const PUBLIC_PATHS = new Set([SIGN_IN_PATH, SIGN_OUT_PATH])

/** Root-level static files (src/app/icon.svg, a future public/ folder). */
const STATIC_FILE = /^\/[\w.-]+\.(?:ico|svg|png|jpe?g|gif|webp|avif|txt|xml|webmanifest|woff2?)$/

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || STATIC_FILE.test(pathname)
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/")
}

async function isSignedIn(request: NextRequest) {
  const config = getAuthConfig()
  if (!config) return false
  const token = request.cookies.get(SESSION_COOKIE)?.value
  return (await verifySession(token, config.secret, config.email)) !== null
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    if (pathname === SIGN_IN_PATH && (await isSignedIn(request))) {
      return NextResponse.redirect(new URL(HOME_PATH, request.url))
    }
    return NextResponse.next()
  }

  if (await isSignedIn(request)) return NextResponse.next()

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const signIn = new URL(SIGN_IN_PATH, request.url)
  const next = safeNext(`${pathname}${search}`)
  if (next !== DEFAULT_NEXT) signIn.searchParams.set("next", next)
  return NextResponse.redirect(signIn)
}

export const config = {
  // Everything except Next's own assets (static chunks, image optimiser, dev
  // HMR) and the favicon. Kept broad on purpose: a new route is locked by
  // default.
  matcher: ["/((?!_next/|favicon\\.ico).*)"],
}
