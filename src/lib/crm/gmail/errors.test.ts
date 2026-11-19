import { describe, expect, it } from "vitest"

import { GmailApiError, googleErrorStatus, isGoogleNotFound } from "./errors"
import { gaxiosNotFoundError } from "./fake-api"

describe("googleErrorStatus", () => {
  it("reads a realistic gaxios 404 (status + response.status)", () => {
    const error = gaxiosNotFoundError(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/m_gone?format=full"
    )
    expect(googleErrorStatus(error)).toBe(404)
    expect(isGoogleNotFound(error)).toBe(true)
  })

  it("reads response.status alone", () => {
    expect(googleErrorStatus({ response: { status: 404 } })).toBe(404)
  })

  it("reads a numeric or numeric-string code", () => {
    expect(googleErrorStatus({ code: 404 })).toBe(404)
    expect(googleErrorStatus({ code: "404" })).toBe(404)
    expect(isGoogleNotFound(Object.assign(new Error("x"), { code: "404" }))).toBe(true)
  })

  it("ignores system error codes and non-objects", () => {
    expect(googleErrorStatus({ code: "ECONNRESET" })).toBeUndefined()
    expect(googleErrorStatus(new Error("boom"))).toBeUndefined()
    expect(googleErrorStatus(null)).toBeUndefined()
    expect(googleErrorStatus("404")).toBeUndefined()
  })
})

describe("GmailApiError", () => {
  it("names the method and status, keeps the 404, and drops the request config", () => {
    const wrapped = new GmailApiError(
      "users.messages.get",
      gaxiosNotFoundError("https://gmail.googleapis.com/gmail/v1/users/me/messages/m_gone")
    )
    expect(wrapped.message).toBe(
      "Gmail users.messages.get failed (404): Requested entity was not found."
    )
    expect(wrapped.method).toBe("users.messages.get")
    expect(isGoogleNotFound(wrapped)).toBe(true)
    expect(JSON.stringify({ ...wrapped, message: wrapped.message })).not.toContain(
      "Bearer"
    )
    expect(wrapped.cause).toBeUndefined()
  })
})
