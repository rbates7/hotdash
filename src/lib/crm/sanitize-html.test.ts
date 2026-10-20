// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { safeUrl, sanitizeHtml } from "@/lib/crm/sanitize-html"

const clean = (html: string) => sanitizeHtml(html) ?? ""

/** The output, parsed back, so assertions are on elements and not on string spelling. */
function parse(html: string) {
  const div = document.createElement("div")
  div.innerHTML = clean(html)
  return div
}

describe("sanitizeHtml", () => {
  it("drops script, with its text, wherever it sits", () => {
    const out = clean('<p>Hi</p><script>alert(1)</script><div><script src="https://x.example.com/a.js"></script>ok</div>')
    expect(out).not.toMatch(/script/i)
    expect(out).not.toContain("alert")
    expect(out).toBe("<p>Hi</p><div>ok</div>")
  })

  it("drops inline handlers and the style attribute", () => {
    const div = parse('<p onclick="alert(1)" style="color:red" class="x" id="y">Hi</p><img src="https://img.example.com/a.png" onerror="alert(1)" alt="logo">')
    const p = div.querySelector("p")!
    expect(p.attributes).toHaveLength(0)
    const img = div.querySelector("img")!
    expect(img.getAttribute("onerror")).toBeNull()
    expect(img.getAttribute("src")).toBe("https://img.example.com/a.png")
    expect(img.getAttribute("alt")).toBe("logo")
  })

  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["java\tscript:alert(1)"],
    ["java\nscript:alert(1)"],
    [" \u0001javascript:alert(1)"],
    ["&#106;avascript:alert(1)"],
    ["&#x6A;avascript&colon;alert(1)"],
    ["vbscript:msgbox(1)"],
    ["data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
    ["/relative/path"],
  ])("drops the href %j but keeps the link text", (href) => {
    const div = parse(`<a href="${href}" onclick="x()">click</a>`)
    const a = div.querySelector("a")!
    expect(a.getAttribute("href")).toBeNull()
    expect(a.getAttribute("onclick")).toBeNull()
    expect(a.textContent).toBe("click")
  })

  it("keeps safe links, opening in a new tab without an opener", () => {
    const div = parse('<a href="https://example.com/docs?a=1">docs</a> <a href="mailto:help@example.com">mail</a> <a href="http://example.com">http</a>')
    const links = [...div.querySelectorAll("a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com/docs?a=1",
      "mailto:help@example.com",
      "http://example.com/",
    ])
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank")
      expect(a.getAttribute("rel")).toBe("noopener noreferrer")
    }
  })

  it("drops style, iframe, object, embed, form and svg with their contents", () => {
    const out = clean(
      '<style>p{}</style><iframe src="https://example.com"></iframe><object data="x"></object><embed src="x">' +
        '<form action="https://example.com"><input name="a"><button>Go</button></form><svg><script>alert(1)</script></svg>' +
        "<math><mi>x</mi></math><p>kept</p>"
    )
    expect(out).toBe("<p>kept</p>")
  })

  it("only allows https images; http, data: and javascript: images go", () => {
    const div = parse(
      '<img src="http://img.example.com/a.png"><img src="data:image/png;base64,AAAA"><img src="javascript:alert(1)"><img src="https://img.example.com/ok.png">'
    )
    expect([...div.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["https://img.example.com/ok.png"])
  })

  it("unwraps unknown tags, keeps text, and keeps table spans", () => {
    const div = parse(
      '<center><font color="red">Hello <b>there</b></font></center><table><tbody><tr><td colspan="2" width="9">a</td><th rowspan="x">b</th></tr></tbody></table>'
    )
    expect(div.querySelector("font")).toBeNull()
    expect(div.querySelector("center")).toBeNull()
    expect(div.textContent).toContain("Hello there")
    expect(div.querySelector("b")!.textContent).toBe("there")
    const td = div.querySelector("td")!
    expect(td.getAttribute("colspan")).toBe("2")
    expect(td.getAttribute("width")).toBeNull()
    expect(div.querySelector("th")!.getAttribute("rowspan")).toBeNull()
  })

  it("escapes text so markup in text never becomes a tag", () => {
    const out = clean("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")
    expect(out).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")
    expect(parse("<p>&lt;img src=x onerror=alert(1)&gt;</p>").querySelector("img")).toBeNull()
  })

  it("drops comments and the head", () => {
    expect(clean("<html><head><title>t</title><meta http-equiv=refresh content=0></head><body><!-- x --><p>a</p></body></html>")).toBe("<p>a</p>")
  })
})

describe("safeUrl", () => {
  const LINKS = new Set(["http:", "https:", "mailto:"])
  it("normalises an allowed URL and refuses the rest", () => {
    expect(safeUrl("HTTPS://Example.com", LINKS)).toBe("https://example.com/")
    expect(safeUrl("  https://example.com/a b", LINKS)).toBe("https://example.com/ab")
    expect(safeUrl("ftp://example.com", LINKS)).toBeNull()
    expect(safeUrl("javascript:alert(1)", LINKS)).toBeNull()
  })
})
