import { afterEach, describe, expect, it } from "vitest"

import { googleConfig } from "./client"

const KEYS = [
  "CRM_GOOGLE_CLIENT_ID",
  "CRM_GOOGLE_CLIENT_SECRET",
  "CRM_GOOGLE_REDIRECT_URI",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
] as const

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("googleConfig", () => {
  it("reuses the production dashboard Gmail client credentials", () => {
    delete process.env.CRM_GOOGLE_CLIENT_ID
    delete process.env.CRM_GOOGLE_CLIENT_SECRET
    process.env.GMAIL_CLIENT_ID = "client.apps.googleusercontent.com"
    process.env.GMAIL_CLIENT_SECRET = "secret"

    expect(googleConfig()).toMatchObject({
      clientId: "client.apps.googleusercontent.com",
      clientSecret: "secret",
    })
  })

  it("prefers CRM-specific credentials when supplied", () => {
    process.env.GMAIL_CLIENT_ID = "shared.apps.googleusercontent.com"
    process.env.GMAIL_CLIENT_SECRET = "shared"
    process.env.CRM_GOOGLE_CLIENT_ID = "crm.apps.googleusercontent.com"
    process.env.CRM_GOOGLE_CLIENT_SECRET = "crm"

    expect(googleConfig()).toMatchObject({
      clientId: "crm.apps.googleusercontent.com",
      clientSecret: "crm",
    })
  })
})
