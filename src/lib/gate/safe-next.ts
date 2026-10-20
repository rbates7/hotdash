import { DEFAULT_NEXT, LOGIN_PATH, LOGOUT_PATH, UNLOCK_PATH } from "@/lib/gate/paths"

const PLACEHOLDER_ORIGIN = "http://hotdash.invalid"
const NO_RETURN = [UNLOCK_PATH, LOGIN_PATH, LOGOUT_PATH]

/**
 * `next` if it is a same-origin relative path (`/crm?tab=cases`), otherwise
 * DEFAULT_NEXT. Rejects absolute and protocol-relative URLs (`//evil.com`,
 * `/\evil.com`), control characters, and the gate's own paths so a redirect
 * can never leave the site or loop. (Same rules as #38's safeNext.)
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return DEFAULT_NEXT
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_NEXT
  // Browsers treat `\` like `/`, and strip tabs/newlines before parsing.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_NEXT

  let url: URL
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN)
  } catch {
    return DEFAULT_NEXT
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return DEFAULT_NEXT
  if (NO_RETURN.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return DEFAULT_NEXT
  return `${url.pathname}${url.search}${url.hash}`
}
