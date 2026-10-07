import type { Locator } from "@playwright/test"

export type TextContrast = { text: string; ratio: number; fg: string; bg: string }

/**
 * WCAG contrast of every text node inside an element, each measured with
 * the colour of the element that actually paints it against what is really
 * behind it: the backgrounds up the tree composited onto the nearest opaque
 * ancestor, so translucent chips are measured honestly. Shared by every
 * screen's e2e; Home and Metrics both call it on their sample-data surfaces.
 */
export async function textNodeContrasts(locator: Locator): Promise<TextContrast[]> {
  return locator.evaluate((root) => {
    // Computed colours arrive as oklch()/color(srgb …) under Tailwind v4;
    // painting a pixel is the one parser that understands every syntax.
    const ctx = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    })!
    const parse = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    type Rgb = { r: number; g: number; b: number }
    const over = (top: ReturnType<typeof parse>, under: Rgb): Rgb => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: Rgb) => {
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const backdropOf = (el: Element): Rgb => {
      const layers: ReturnType<typeof parse>[] = []
      let node: Element | null = el
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor)
        if (bg.a > 0) layers.push(bg)
        if (bg.a >= 1) break
        node = node.parentElement
      }
      let backdrop: Rgb = { r: 255, g: 255, b: 255 }
      for (const layer of layers.reverse()) backdrop = over(layer, backdrop)
      return backdrop
    }
    const rgb = ({ r, g, b }: Rgb) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`

    const out: { text: string; ratio: number; fg: string; bg: string }[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim()
      const el = n.parentElement
      if (!text || !el) continue
      const backdrop = backdropOf(el)
      const fg = over(parse(getComputedStyle(el).color), backdrop)
      const [l1, l2] = [lum(fg), lum(backdrop)].sort((a, b) => b - a)
      out.push({
        text,
        ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
        fg: rgb(fg),
        bg: rgb(backdrop),
      })
    }
    return out
  })
}

/** Assert every text node in `locator` clears WCAG AA for normal text. */
export async function expectReadable(
  locator: Locator,
  label: string,
  expect: typeof import("@playwright/test").expect
) {
  const nodes = await textNodeContrasts(locator)
  expect(nodes.length, `${label}: text nodes measured`).toBeGreaterThan(0)
  for (const node of nodes) {
    expect(node.ratio, `${label}: "${node.text}" ${node.fg} on ${node.bg}`).toBeGreaterThanOrEqual(4.5)
  }
  return nodes
}
