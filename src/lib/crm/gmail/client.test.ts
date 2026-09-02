import { describe, expect, it } from "vitest"

import { isApiDisabled, isRateLimited } from "./client"

describe("isApiDisabled", () => {
  it("matches the structured accessNotConfigured reason", () => {
    expect(
      isApiDisabled({
        message: "Forbidden",
        errors: [{ reason: "accessNotConfigured" }],
      })
    ).toBe(true)
  })

  it("matches the reason nested under the gaxios response", () => {
    expect(
      isApiDisabled({
        response: {
          data: { error: { errors: [{ reason: "accessNotConfigured" }] } },
        },
      })
    ).toBe(true)
  })

  it("matches the prose Google actually returned", () => {
    expect(
      isApiDisabled({
        message:
          "Gmail API has not been used in project 12345 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=12345 then retry.",
      })
    ).toBe(true)
  })

  it("does not claim a scope problem is a disabled API", () => {
    expect(
      isApiDisabled({
        message: "Request had insufficient authentication scopes.",
        errors: [{ reason: "insufficientPermissions" }],
      })
    ).toBe(false)
  })

  it("tolerates junk", () => {
    expect(isApiDisabled(null)).toBe(false)
    expect(isApiDisabled(new Error("network down"))).toBe(false)
  })
})

describe("isRateLimited", () => {
  it("recognises a plain 429", () => {
    expect(isRateLimited({ status: 429 })).toBe(true)
  })

  it("recognises the 403 Gmail actually returns for quota", () => {
    // The shape behind "Quota exceeded for quota metric 'Queries'".
    expect(
      isRateLimited({
        status: 403,
        message: "Quota exceeded for quota metric 'Queries'",
        errors: [{ reason: "rateLimitExceeded" }],
      })
    ).toBe(true)
    expect(
      isRateLimited({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
        },
      })
    ).toBe(true)
  })

  it("does not confuse a disabled API with throttling", () => {
    // Same status, entirely different fix — retrying this forever would hang.
    expect(
      isRateLimited({
        status: 403,
        message: "Gmail API has not been used in project 12345 before or it is disabled.",
        errors: [{ reason: "accessNotConfigured" }],
      })
    ).toBe(false)
  })

  it("does not confuse a scope problem with throttling", () => {
    expect(
      isRateLimited({
        status: 403,
        message: "Request had insufficient authentication scopes.",
        errors: [{ reason: "insufficientPermissions" }],
      })
    ).toBe(false)
  })

  it("tolerates junk", () => {
    expect(isRateLimited(null)).toBe(false)
    expect(isRateLimited(new Error("socket hang up"))).toBe(false)
  })
})
