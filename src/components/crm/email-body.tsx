"use client"

import * as React from "react"

// Sanitized-at-ingest HTML rendered inside a sandboxed iframe: no scripts
// (sandbox omits allow-scripts), style isolation, light background because
// email HTML assumes white. allow-same-origin only enables the auto-height
// measurement; with scripts blocked it cannot reach the parent.
const FRAME_STYLES = `
  body { margin: 0; padding: 12px 14px; font: 14px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2328; background: #ffffff; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #1d4ed8; }
  blockquote { border-left: 3px solid #d0d7de; margin: 8px 0; padding-left: 12px; color: #57606a; }
  pre { white-space: pre-wrap; }
  table { max-width: 100%; }
`

export function EmailBody({
  html,
  text,
}: {
  html: string | null
  text: string | null
}) {
  const [height, setHeight] = React.useState(120)

  if (html) {
    const srcDoc =
      `<!doctype html><html><head><meta charset="utf-8">` +
      // Blocks every remote load. Without it, opening a case pings the
      // sender's tracker with the reader's IP and User-Agent — and the
      // corpus here is unsolicited inbound mail. Also defence in depth
      // against a future sanitizer bypass.
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">` +
      `<base target="_blank"><style>${FRAME_STYLES}</style></head>` +
      `<body>${html}</body></html>`
    return (
      <iframe
        // NEVER add allow-scripts here. This frame renders attacker-supplied
        // email HTML and runs in the app's own origin, so scripts would mean
        // same-origin XSS against a page holding Gmail tokens. allow-same-origin
        // exists only so onLoad can measure the document height below; if that
        // ever needs scripts, drop allow-same-origin in the same change.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        title="Email content"
        className="w-full rounded-md bg-white"
        style={{ height }}
        onLoad={(event) => {
          try {
            const doc = event.currentTarget.contentDocument
            if (doc) {
              setHeight(Math.min(doc.documentElement.scrollHeight + 4, 1400))
            }
          } catch {
            // Cross-origin restriction — keep the fallback height.
          }
        }}
      />
    )
  }

  return (
    <div className="rounded-md bg-muted/40 px-3.5 py-3 text-sm whitespace-pre-wrap">
      {text ?? "(empty message)"}
    </div>
  )
}
