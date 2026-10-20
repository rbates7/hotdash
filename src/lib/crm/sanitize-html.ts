/**
 * An allow-list sanitizer for email bodies, with no dependency: the HTML is
 * parsed by the browser's own `DOMParser` into an inert document (nothing
 * in it runs or loads), and a fresh tree is rebuilt from only the tags and
 * attributes below. Everything else is dropped:
 *
 * - **Dropped with their contents**: script, style, iframe, object, embed,
 *   form and its controls, svg, math, template, noscript and the like.
 * - **Unwrapped** (children kept, tag gone): any other tag not allowed.
 * - **Attributes**: only `a[href]`, `img[src|alt]`, `td|th[colspan|rowspan]`.
 *   No `on*` handler, no `style`, no `class`, no `id` survives.
 * - **URLs**: links must be http, https or mailto; images https. The
 *   check runs on the value the URL parser sees (entities already decoded
 *   by the parser, tabs, newlines and control characters stripped, case
 *   folded), so `JaVaScRiPt:`, `java\tscript:` and `&#106;avascript:` all
 *   fail it. Links open in a new tab with `rel="noopener noreferrer"`.
 *
 * Without `DOMParser` (the server), it returns null and the caller shows
 * the plain-text body instead.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "a", "b", "strong", "i", "em", "u", "ul", "ol", "li", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "img", "hr",
])

/** Removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "input", "button",
  "select", "option", "textarea", "svg", "math", "template", "noscript", "noembed", "noframes", "xmp",
  "plaintext", "title", "head", "meta", "link", "base", "audio", "video", "source", "track", "canvas", "portal",
])

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"])
const IMAGE_PROTOCOLS = new Set(["https:"])

/**
 * Characters the URL parser ignores or that can hide a scheme: C0 controls
 * and space, DEL and C1 controls, zero-width marks, line and paragraph
 * separators, and the byte-order mark.
 */
function isUrlNoise(code: number) {
  return (
    code <= 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0xfeff
  )
}

function stripUrlNoise(value: string) {
  let out = ""
  for (const ch of value) if (!isUrlNoise(ch.codePointAt(0)!)) out += ch
  return out
}

/** The URL to keep, or null. Relative URLs have no meaning in an email: dropped. */
export function safeUrl(value: string, protocols: ReadonlySet<string>): string | null {
  const compact = stripUrlNoise(value)
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)
  if (!scheme || !protocols.has(`${scheme[1]!.toLowerCase()}:`)) return null
  try {
    const url = new URL(compact)
    return protocols.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

const SPAN = /^[1-9]\d{0,2}$/

/** Copies the allowed attributes; false when the element must go (an image without a safe source). */
function copyAttributes(from: Element, to: Element, tag: string) {
  if (tag === "a") {
    const href = from.getAttribute("href")
    const safe = href === null ? null : safeUrl(href, LINK_PROTOCOLS)
    if (safe) {
      to.setAttribute("href", safe)
      to.setAttribute("target", "_blank")
      to.setAttribute("rel", "noopener noreferrer")
    }
  } else if (tag === "img") {
    const src = from.getAttribute("src")
    const safe = src === null ? null : safeUrl(src, IMAGE_PROTOCOLS)
    if (!safe) return false
    to.setAttribute("src", safe)
    const alt = from.getAttribute("alt")
    if (alt !== null) to.setAttribute("alt", alt)
  } else if (tag === "td" || tag === "th") {
    for (const name of ["colspan", "rowspan"]) {
      const v = from.getAttribute(name)?.trim()
      if (v && SPAN.test(v)) to.setAttribute(name, v)
    }
  }
  return true
}

const HTML_NS = "http://www.w3.org/1999/xhtml"

function cleanChildren(from: Node, to: Node, doc: Document) {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === 3) {
      to.appendChild(doc.createTextNode(child.textContent ?? ""))
      continue
    }
    if (child.nodeType !== 1) continue // comments, processing instructions
    const el = child as Element
    const tag = el.localName.toLowerCase()
    // Anything not plain HTML (an svg or math child) is dropped whole.
    if (el.namespaceURI !== HTML_NS || DROP_WITH_CONTENT.has(tag)) continue
    if (!ALLOWED_TAGS.has(tag)) {
      cleanChildren(el, to, doc)
      continue
    }
    const out = doc.createElement(tag)
    if (!copyAttributes(el, out, tag)) continue
    cleanChildren(el, out, doc)
    to.appendChild(out)
  }
}

/** The sanitized HTML, or null where there is no DOMParser (render `bodyText` instead). */
export function sanitizeHtml(html: string): string | null {
  if (typeof DOMParser === "undefined") return null
  const parser = new DOMParser()
  const source = parser.parseFromString(html, "text/html")
  const target = parser.parseFromString("<!doctype html><body></body>", "text/html")
  const root = target.createElement("div")
  cleanChildren(source.body, root, target)
  return root.innerHTML
}
