// Fixtures mirror gmail_v1 users.messages.get(format:"full") responses.
// Bodies are base64url like the real API.

import type { GmailMessagePart, GmailRawMessage } from "../types"

export const FOUNDER = "rashad@chlk.xyz"
export const FOUNDER_ALIAS = "rb@chlk.xyz"

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url")

type FixtureInput = {
  id: string
  threadId: string
  from: string
  to?: string
  cc?: string
  subject?: string
  text?: string
  html?: string
  labels?: string[]
  sentAt: string
  extraHeaders?: Record<string, string>
  attachments?: { filename: string; mimeType: string; size: number }[]
}

export function makeMessage(input: FixtureInput): GmailRawMessage {
  const headers = [
    { name: "From", value: input.from },
    { name: "To", value: input.to ?? FOUNDER },
    ...(input.cc ? [{ name: "Cc", value: input.cc }] : []),
    { name: "Subject", value: input.subject ?? "(none)" },
    { name: "Date", value: new Date(input.sentAt).toUTCString() },
    { name: "Message-ID", value: `<${input.id}@mail.example>` },
    ...Object.entries(input.extraHeaders ?? {}).map(([name, value]) => ({
      name,
      value,
    })),
  ]

  const textPart: GmailMessagePart | null = input.text
    ? {
        partId: "0",
        mimeType: "text/plain",
        filename: "",
        body: { size: input.text.length, data: b64(input.text) },
      }
    : null
  const htmlPart: GmailMessagePart | null = input.html
    ? {
        partId: "1",
        mimeType: "text/html",
        filename: "",
        body: { size: input.html.length, data: b64(input.html) },
      }
    : null
  const attachmentParts: GmailMessagePart[] = (input.attachments ?? []).map(
    (a, i) => ({
      partId: `a${i}`,
      mimeType: a.mimeType,
      filename: a.filename,
      body: { size: a.size, attachmentId: `att_${i}` },
    })
  )

  let payload: GmailMessagePart
  const bodyParts = [textPart, htmlPart].filter(
    (p): p is GmailMessagePart => p !== null
  )
  if (bodyParts.length <= 1 && attachmentParts.length === 0) {
    payload = bodyParts[0]
      ? { ...bodyParts[0], headers, partId: "" }
      : { mimeType: "text/plain", filename: "", headers, body: { size: 0 } }
  } else if (attachmentParts.length === 0) {
    payload = {
      partId: "",
      mimeType: "multipart/alternative",
      filename: "",
      headers,
      body: { size: 0 },
      parts: bodyParts,
    }
  } else {
    // multipart/mixed wrapping an alternative + attachments — the nested
    // shape real mail clients produce.
    payload = {
      partId: "",
      mimeType: "multipart/mixed",
      filename: "",
      headers,
      body: { size: 0 },
      parts: [
        bodyParts.length > 1
          ? {
              partId: "alt",
              mimeType: "multipart/alternative",
              filename: "",
              body: { size: 0 },
              parts: bodyParts,
            }
          : (bodyParts[0] ?? {
              partId: "alt",
              mimeType: "text/plain",
              filename: "",
              body: { size: 0 },
            }),
        ...attachmentParts,
      ],
    }
  }

  return {
    id: input.id,
    threadId: input.threadId,
    labelIds: input.labels ?? ["INBOX"],
    snippet: (input.text ?? "").slice(0, 100),
    internalDate: String(new Date(input.sentAt).getTime()),
    payload,
  }
}

export const inboundPlainDana = makeMessage({
  id: "m_dana_1",
  threadId: "t_dana",
  from: "Dana Whitfield <Dana@Acme.com>",
  subject: "Can't invite teammates",
  text: "The invite button spins forever.",
  sentAt: "2026-08-25T10:00:00Z",
})

export const outboundReplyFounder = makeMessage({
  id: "m_dana_2",
  threadId: "t_dana",
  from: `Rashad Bates <${FOUNDER}>`,
  to: "Dana Whitfield <dana@acme.com>",
  subject: "Re: Can't invite teammates",
  text: "Looking into it now — which browser?",
  labels: ["SENT"],
  sentAt: "2026-08-25T12:00:00Z",
})

export const inboundReplyDana = makeMessage({
  id: "m_dana_3",
  threadId: "t_dana",
  from: "Dana Whitfield <dana@acme.com>",
  subject: "Re: Can't invite teammates",
  text: "Chrome on macOS.",
  sentAt: "2026-08-25T14:00:00Z",
})

export const aliasOutbound = makeMessage({
  id: "m_alias_1",
  threadId: "t_dana",
  from: `Rashad <${FOUNDER_ALIAS}>`,
  to: "dana@acme.com",
  subject: "Re: Can't invite teammates",
  text: "Also — fixed in the next deploy.",
  labels: ["SENT"],
  sentAt: "2026-08-25T15:00:00Z",
})

export const inboundHtml = makeMessage({
  id: "m_priya_1",
  threadId: "t_priya",
  from: '"Raman, Priya" <priya@birchwood.io>',
  subject: "Onboarding stuck",
  text: "Checklist stays at step 3.",
  html: '<div><p>Checklist stays at <b>step 3</b>.</p><script>alert("x")</script><a href="https://birchwood.io/log">log</a><img src="cid:inline1"><img src="https://birchwood.io/shot.png" alt="shot"></div>',
  sentAt: "2026-08-26T09:00:00Z",
})

export const inboundWithAttachment = makeMessage({
  id: "m_dana_att",
  threadId: "t_dana_att",
  from: "Dana Whitfield <dana@acme.com>",
  subject: "Screenshot attached",
  text: "See attached.",
  html: "<p>See attached.</p>",
  attachments: [
    { filename: "screenshot.png", mimeType: "image/png", size: 482133 },
  ],
  sentAt: "2026-08-27T09:00:00Z",
})

export const newsletter = makeMessage({
  id: "m_news_1",
  threadId: "t_news",
  from: "SaaS Times <digest@saastimes.com>",
  subject: "This week in SaaS",
  text: "Top stories...",
  extraHeaders: {
    "List-Unsubscribe": "<https://saastimes.com/unsub>",
    Precedence: "bulk",
  },
  sentAt: "2026-08-27T08:00:00Z",
})

export const noreplyReceipt = makeMessage({
  id: "m_receipt_1",
  threadId: "t_receipt",
  from: "no-reply@paymentsplatform.example",
  subject: "Your receipt",
  text: "Receipt #123",
  sentAt: "2026-08-27T07:00:00Z",
})

export const unknownHuman = makeMessage({
  id: "m_lena_1",
  threadId: "t_lena",
  from: "Lena Ortiz <lena@futurebridge.vc>",
  subject: "Intro",
  text: "Would love to chat about Chlk.",
  sentAt: "2026-08-27T10:00:00Z",
})

export const unknownHumanFollowup = makeMessage({
  id: "m_lena_2",
  threadId: "t_lena",
  from: "Lena Ortiz <lena@futurebridge.vc>",
  subject: "Re: Intro",
  text: "Bumping this!",
  sentAt: "2026-08-28T10:00:00Z",
})

export const missingFrom: GmailRawMessage = {
  id: "m_broken",
  threadId: "t_broken",
  labelIds: ["INBOX"],
  snippet: "",
  internalDate: String(Date.parse("2026-08-27T11:00:00Z")),
  payload: {
    partId: "",
    mimeType: "text/plain",
    filename: "",
    headers: [{ name: "Subject", value: "No sender" }],
    body: { size: 0 },
  },
}

export const spamMessage = makeMessage({
  id: "m_spam",
  threadId: "t_spam",
  from: "winner@lottery.example",
  subject: "You won",
  text: "Claim now",
  labels: ["SPAM"],
  sentAt: "2026-08-27T12:00:00Z",
})

// A website contact form: the host sends it, the coach wrote it.
export const formSubmissionKnown = makeMessage({
  id: "m_form_1",
  threadId: "t_form_1",
  from: "Squarespace <form-submission@squarespace.info>",
  extraHeaders: { "Reply-To": "Dana Whitfield <dana@acme.com>" },
  subject: "Form Submission - Contact Form",
  text: "Name: Dana Whitfield\nEmail: dana@acme.com\nMessage: Can I move a play between playbooks?",
  sentAt: "2026-08-28T15:00:00Z",
})

export const formSubmissionUnknown = makeMessage({
  id: "m_form_2",
  threadId: "t_form_2",
  from: "Squarespace <form-submission@squarespace.info>",
  subject: "Form Submission - Contact Form",
  text: "Name: Marcus Hall\nEmail: marcus@northside.k12.us\nMessage: Do you have a team plan?",
  sentAt: "2026-08-28T16:00:00Z",
})
