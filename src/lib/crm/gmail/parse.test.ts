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
import {
  isBulk,
  parseAddressList,
  parseMessage,
  resolveRelaySender,
  sanitizeEmailHtml,
} from "./parse"

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

describe("sanitizer hardening", () => {
  it("strips script, event handlers, and javascript: urls", () => {
    const out = sanitizeEmailHtml(
      '<p onclick="steal()">hi</p><script>x()</script>' +
        '<a href="javascript:alert(1)">click</a>' +
        '<a href="JaVaScRiPt&#9;:alert(1)">tab</a>'
    )
    expect(out).not.toContain("script")
    expect(out).not.toContain("onclick")
    expect(out.toLowerCase()).not.toContain("javascript:")
  })

  it("drops style attributes and tags, which are the CSS exfiltration vector", () => {
    const out = sanitizeEmailHtml(
      '<div style="background:url(https://evil.example/x)">a</div>' +
        "<style>@import url(https://evil.example/y);</style>"
    )
    expect(out).not.toContain("style")
    expect(out).not.toContain("evil.example")
  })

  it("neutralises redirect and base-tag vectors", () => {
    const out = sanitizeEmailHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.example">' +
        '<base href="https://evil.example/">' +
        '<iframe src="https://evil.example"></iframe>' +
        '<form action="https://evil.example"><input name="a"></form>'
    )
    expect(out).not.toContain("evil.example")
  })

  it("forces safe link attributes even when the sender sets their own", () => {
    const out = sanitizeEmailHtml(
      '<a href="https://ok.example" target="_self" rel="opener">x</a>'
    )
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).not.toContain('rel="opener"')
  })
})

describe("isBulk", () => {
  const noHeaders = new Map<string, string>()

  it("catches automation words anywhere in the local part", () => {
    // The real miss: this reached triage because the pattern was anchored.
    expect(isBulk(noHeaders, "payments-noreply@google.com")).toBe(true)
    expect(isBulk(noHeaders, "billing.do-not-reply@vendor.com")).toBe(true)
    expect(isBulk(noHeaders, "mailer-daemon@relay.net")).toBe(true)
  })

  it("matches weaker words only as a whole segment", () => {
    expect(isBulk(noHeaders, "news@league.org")).toBe(true)
    expect(isBulk(noHeaders, "form-submission@squarespace.info")).toBe(true)
    // A coach whose name merely contains one of them is not bulk.
    expect(isBulk(noHeaders, "newsome@westhigh.edu")).toBe(false)
    expect(isBulk(noHeaders, "jupdates@school.org")).toBe(false)
  })

  it("treats Gmail's marketing categories as bulk", () => {
    expect(isBulk(noHeaders, "info@e.atlassian.com", ["INBOX"])).toBe(false)
    expect(
      isBulk(noHeaders, "info@e.atlassian.com", [
        "INBOX",
        "CATEGORY_PROMOTIONS",
      ])
    ).toBe(true)
  })

  it("leaves CATEGORY_UPDATES alone — real first contact lands there", () => {
    expect(isBulk(noHeaders, "coach@westhigh.edu", ["CATEGORY_UPDATES"])).toBe(
      false
    )
  })

  it("still honours the bulk headers", () => {
    expect(
      isBulk(new Map([["list-unsubscribe", "<mailto:x@y.z>"]]), "hi@y.z")
    ).toBe(true)
    expect(isBulk(new Map([["precedence", "bulk"]]), "hi@y.z")).toBe(true)
  })

  it("lets an ordinary human through", () => {
    expect(isBulk(noHeaders, "dana@acme.com")).toBe(false)
  })
})

describe("resolveRelaySender", () => {
  const relayFrom = { name: "Squarespace", email: "form-submission@squarespace.info" }

  it("prefers Reply-To, which is what a form host sets it for", () => {
    expect(
      resolveRelaySender(
        new Map([["reply-to", "Jane Coach <jane@westhigh.edu>"]]),
        relayFrom,
        null
      )
    ).toEqual({ name: "Jane Coach", email: "jane@westhigh.edu" })
  })

  it("reads the form body when Reply-To is absent", () => {
    const body = [
      "Form Submission - Contact Form",
      "",
      "Name: Jane Coach",
      "Email: jane@westhigh.edu",
      "Message: How do I share a playbook with my staff?",
    ].join("\n")
    expect(resolveRelaySender(new Map(), relayFrom, body)).toEqual({
      name: "Jane Coach",
      email: "jane@westhigh.edu",
    })
  })

  it("takes the name from the body when Reply-To has only an address", () => {
    expect(
      resolveRelaySender(
        new Map([["reply-to", "jane@westhigh.edu"]]),
        relayFrom,
        "Name: Jane Coach\nEmail: jane@westhigh.edu"
      )
    ).toEqual({ name: "Jane Coach", email: "jane@westhigh.edu" })
  })

  it("leaves ordinary senders alone", () => {
    expect(
      resolveRelaySender(
        new Map([["reply-to", "someone@else.com"]]),
        { name: "Dana", email: "dana@acme.com" },
        null
      )
    ).toBeNull()
  })

  it("does not rescue a newsletter with a friendly Reply-To", () => {
    expect(
      resolveRelaySender(
        new Map([
          ["list-unsubscribe", "<mailto:x@y.z>"],
          ["reply-to", "hello@vendor.com"],
        ]),
        { name: "Vendor News", email: "news@vendor.com" },
        null
      )
    ).toBeNull()
  })

  it("does not rescue one machine address into another", () => {
    expect(
      resolveRelaySender(
        new Map([["reply-to", "support-noreply@vendor.com"]]),
        { name: null, email: "noreply@vendor.com" },
        null
      )
    ).toBeNull()
  })

  it("stays null when there is no human to find", () => {
    expect(
      resolveRelaySender(new Map(), relayFrom, "Your invoice is ready.")
    ).toBeNull()
  })
})
