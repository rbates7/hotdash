/**
 * Cross-site form posts are refused. Uses Origin, or Sec-Fetch-Site when a
 * browser omits Origin; a request with neither (curl) is allowed, since the
 * cookie it could set lands in that client only.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (origin) return origin === new URL(request.url).origin
  const site = request.headers.get("sec-fetch-site")
  return !site || site === "same-origin" || site === "none"
}
