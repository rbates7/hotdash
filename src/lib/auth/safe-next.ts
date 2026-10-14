import { SIGN_IN_PATH } from "@/lib/auth/paths"

/** Where the app lands after sign-in when there is no usable `next`. */
export const DEFAULT_NEXT = "/"

const PLACEHOLDER_ORIGIN = "http://hotdash.invalid"

/**
 * `next` if it is a same-origin relative path (`/crm?tab=cases`), otherwise
 * DEFAULT_NEXT. Rejects absolute and protocol-relative URLs (`//evil.com`,
 * `/\evil.com`), anything with control characters, and the sign-in page
 * itself so a redirect can never loop back to it.
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
  if (url.pathname === SIGN_IN_PATH || url.pathname.startsWith(`${SIGN_IN_PATH}/`)) {
    return DEFAULT_NEXT
  }
  return `${url.pathname}${url.search}${url.hash}`
}
