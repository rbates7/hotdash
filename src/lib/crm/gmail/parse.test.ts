import { describe, expect, it } from "vitest"

import {
  aliasOutbound,
  FOUNDER,
  FOUNDER_ALIAS,
  inboundHtml,
  inboundPlainDana,
  inboundWithAttachment,
  missingFrom,
  newsletter,
  noreplyReceipt,
  outboundReplyFounder,
  unknownHuman,
} from "./__fixtures__/messages"
import { parseAddressList, parseMessage, sanitizeEmailHtml } from "./parse"

const founders = new Set([FOUNDER, FOUNDER_ALIAS])

describe("parseAddressList", () => {
  it("parses name <email> pairs and bare addresses", () => {
    expect(parseAddressList("Dana Whitfield <dana@acme.com>")).toEqual([
      { name: "Dana Whitfield", email: "dana@acme.com" },
    ])
    expect(parseAddressList("dana@acme.com")).toEqual([
      { name: null, email: "dana@acme.com" },
    ])
  })

  it("handles quoted names containing commas and lists", () => {
    expect(
      parseAddressList('"Raman, Priya" <priya@birchwood.io>, tom@x.io')
    ).toEqual([
      { name: "Raman, Priya", email: "priya@birchwood.io" },
      { name: null, email: "tom@x.io" },
    ])
  })
})

describe("parseMessage", () => {
  it("parses an inbound plain-text message", () => {
    const parsed = parseMessage(inboundPlainDana, founders)!
    expect(parsed.direction).toBe("inbound")
    expect(parsed.fromEmail).toBe("dana@acme.com")
    expect(parsed.fromName).toBe("Dana Whitfield")
    expect(parsed.counterpartyEmail).toBe("dana@acme.com")
    expect(parsed.bodyText).toBe("The invite button spins forever.")
    expect(parsed.bodyHtml).toBeNull()
    expect(parsed.sentAt.toISOString()).toBe("2026-08-25T10:00:00.000Z")
    expect(parsed.isBulk).toBe(false)
  })

  it("detects outbound mail and picks the counterparty from To", () => {
    const parsed = parseMessage(outboundReplyFounder, founders)!
    expect(parsed.direction).toBe("outbound")
    expect(parsed.counterpartyEmail).toBe("dana@acme.com")
    expect(parsed.isBulk).toBe(false)
  })

  it("treats send-as aliases as outbound", () => {
    const parsed = parseMessage(aliasOutbound, founders)!
    expect(parsed.direction).toBe("outbound")
    expect(parsed.counterpartyEmail).toBe("dana@acme.com")
  })

  it("sanitizes html bodies", () => {
    const parsed = parseMessage(inboundHtml, founders)!
    expect(parsed.fromName).toBe("Raman, Priya")
    expect(parsed.bodyHtml).toContain("<b>step 3</b>")
    expect(parsed.bodyHtml).not.toContain("script")
    expect(parsed.bodyHtml).toContain('target="_blank"')
    expect(parsed.bodyHtml).toContain('rel="noopener noreferrer"')
    expect(parsed.bodyHtml).not.toContain("cid:")
    expect(parsed.bodyHtml).toContain("https://birchwood.io/shot.png")
    expect(parsed.bodyText).toBe("Checklist stays at step 3.")
  })

  it("collects attachment metadata from nested multiparts", () => {
    const parsed = parseMessage(inboundWithAttachment, founders)!
    expect(parsed.attachments).toEqual([
      { filename: "screenshot.png", mimeType: "image/png", size: 482133 },
    ])
    expect(parsed.bodyHtml).toContain("See attached.")
    expect(parsed.bodyText).toBe("See attached.")
  })

  it("flags bulk mail via headers and sender patterns", () => {
    expect(parseMessage(newsletter, founders)!.isBulk).toBe(true)
    expect(parseMessage(noreplyReceipt, founders)!.isBulk).toBe(true)
    expect(parseMessage(unknownHuman, founders)!.isBulk).toBe(false)
  })

  it("returns null without a From header", () => {
    expect(parseMessage(missingFrom, founders)).toBeNull()
  })
})

describe("sanitizeEmailHtml", () => {
  it("strips iframes and event handlers", () => {
    const out = sanitizeEmailHtml(
      '<p onclick="x()">hi</p><iframe src="https://evil.example"></iframe>'
    )
    expect(out).toBe("<p>hi</p>")
  })
})
