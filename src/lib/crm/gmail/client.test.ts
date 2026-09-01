import { describe, expect, it } from "vitest"

import { isApiDisabled } from "./client"

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
