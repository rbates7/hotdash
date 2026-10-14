import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { POST } from "./route"

function req(headers: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/auth/sign-out", {
    method: "POST",
    headers: { host: "localhost:3000", ...headers },
  })
}

describe("POST /api/auth/sign-out", () => {
  it("signs out a same-origin request", () => {
    const res = POST(req({ origin: "http://localhost:3000" }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toContain("/sign-in")
  })
  it("refuses a cross-site Origin", () => {
    expect(POST(req({ origin: "https://evil.example" })).status).toBe(403)
  })
  it("refuses a cross-site Sec-Fetch-Site when Origin is missing", () => {
    expect(POST(req({ "sec-fetch-site": "cross-site" })).status).toBe(403)
    expect(POST(req({ "sec-fetch-site": "same-site" })).status).toBe(403)
  })
  it("allows same-origin Sec-Fetch-Site when Origin is missing", () => {
    expect(POST(req({ "sec-fetch-site": "same-origin" })).status).toBe(303)
  })
})
