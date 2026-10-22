import { NextResponse, type NextRequest } from "next/server"

import { getGateConfig } from "@/lib/gate/config"
import { GATE_COOKIE, verifyGateCookie } from "@/lib/gate/cookie"
import { BARE_HEADER, DEFAULT_NEXT, LOGIN_PATH, LOGOUT_PATH, UNLOCK_PATH } from "@/lib/gate/paths"
import { safeNext } from "@/lib/gate/safe-next"

/**
 * The dashboard login gate. Next 16 renamed `middleware.ts` to `proxy.ts`;
 * this runs before every page and API route (see `config.matcher`, #38's):
 *
 * - gate off (neither setting) → through
 * - valid cookie → through
 * - otherwise a page → 307 to /unlock?next=<path>; /api/* → 401 JSON.
 *   Health routes (/api/health/*) are locked like every other API.
 *
 * Misconfigured (only one setting) never lets anything through: /unlock
 * says so and the login route refuses.
 */

/** Gate endpoints that must answer locked-out requests. */
const PUBLIC_PATHS = new Set([UNLOCK_PATH, LOGIN_PATH, LOGOUT_PATH])

/** Root-level static files (src/app/icon.svg, a future public/ folder). */
const STATIC_FILE = /^\/[\w.-]+\.(?:ico|svg|png|jpe?g|gif|webp|avif|txt|xml|webmanifest|woff2?)$/
const CRM_CRON_PATH =
  /^\/api\/crm\/sync\/(?:gmail|stripe|supabase|all)\/?$/

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || STATIC_FILE.test(pathname)
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/")
}

export function isCrmCronRequest(request: NextRequest) {
  return request.method === "GET" && CRM_CRON_PATH.test(request.nextUrl.pathname)
}

/** The unlock page renders without the app shell (no sidebar, no data widgets). */
function bare(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set(BARE_HEADER, "1")
  return NextResponse.next({ request: { headers } })
}

/** Through, minus any client-sent copy of the internal shell-hiding header. */
function through(request: NextRequest) {
  if (!request.headers.has(BARE_HEADER)) return NextResponse.next()
  const headers = new Headers(request.headers)
  headers.delete(BARE_HEADER)
  return NextResponse.next({ request: { headers } })
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const config = getGateConfig()
  if (config.mode === "off") return through(request)

  if (pathname === UNLOCK_PATH) return bare(request)
  if (isPublicPath(pathname)) return through(request)
  // These GET handlers fail closed unless Vercel supplies the CRON_SECRET
  // bearer token. Let that route-level authentication run before the
  // dashboard's interactive login gate.
  if (isCrmCronRequest(request)) return through(request)

  if (
    config.mode === "on" &&
    (await verifyGateCookie(request.cookies.get(GATE_COOKIE)?.value, config.email, config.secret))
  ) {
    return through(request)
  }

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "Locked. Sign in at /unlock." }, { status: 401 })
  }

  const unlock = new URL(UNLOCK_PATH, request.url)
  const next = safeNext(`${pathname}${search}`, request.nextUrl.origin)
  if (next !== DEFAULT_NEXT) unlock.searchParams.set("next", next)
  return NextResponse.redirect(unlock, 307)
}

export const config = {
  // Everything except Next's own assets (static chunks, image optimiser, dev
  // HMR) and the favicon. Broad on purpose: a new route is locked by default.
  matcher: ["/((?!_next/|favicon\\.ico).*)"],
}
