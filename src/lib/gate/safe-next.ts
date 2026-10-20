import { DEFAULT_NEXT, LOGIN_PATH, LOGOUT_PATH, UNLOCK_PATH } from "@/lib/gate/paths"

/** Used when no request origin is passed (the proxy and the unlock page only build paths). */
const PLACEHOLDER_ORIGIN = "http://hotdash.invalid"
const NO_RETURN = [UNLOCK_PATH, LOGIN_PATH, LOGOUT_PATH]

/** A path a browser could read as another host: `//x`, `/\x`, or the same once decoded. */
function hostLike(pathname: string) {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return true
  }
  return [pathname, decoded].some((p) => p.startsWith("//") || p.startsWith("/\\") || p.includes("\\"))
}

/**
 * The one place a post-login destination is checked (#64 review B1).
 *
 * `next` is resolved against `origin` (the request's own origin) and kept
 * only if the result is same-origin and its path cannot be read as another
 * host: no leading `//` or `/\` after resolution (so `/..//evil`,
 * `/%2e%2e//evil` and `/./\/evil` fail), none once percent-decoded
 * (`/%2F%2Fevil`, `/%5Cevil`), and no backslash or control character
 * anywhere in the input. The gate's own paths are refused so it can't loop.
 * Anything else falls back to DEFAULT_NEXT (/home).
 *
 * Returns a relative path (`/crm?tab=cases`), never an absolute URL.
 */
export function safeNext(next: unknown, origin: string = PLACEHOLDER_ORIGIN): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return DEFAULT_NEXT
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_NEXT
  // Browsers treat `\` like `/` and strip tabs/newlines before parsing.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_NEXT

  let base: URL
  let url: URL
  try {
    base = new URL(origin)
    url = new URL(next, base)
  } catch {
    return DEFAULT_NEXT
  }
  if (url.origin !== base.origin) return DEFAULT_NEXT
  if (hostLike(url.pathname)) return DEFAULT_NEXT
  const path = url.pathname.toLowerCase()
  if (NO_RETURN.some((p) => path === p || path.startsWith(`${p}/`))) return DEFAULT_NEXT
  const result = `${url.pathname}${url.search}${url.hash}`
  // Belt and braces: the path we hand back must itself resolve same-origin.
  if (new URL(result, base).origin !== base.origin) return DEFAULT_NEXT
  return result
}
