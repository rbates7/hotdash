import type { Locator, Page } from "@playwright/test"

export type TextContrast = {
  text: string
  ratio: number
  fg: string
  bg: string
  /** Alpha of the computed text colour before compositing; 1 means solid. */
  alpha: number
  /** Product of `opacity` from the text's element up to the root; 1 means none. */
  opacity: number
}

/**
 * Wait for every *finite* animation and transition on the page to finish
 * (dialogs fade in, popovers slide), so opacity is read at rest rather than
 * mid-transition. Infinite ones — skeleton pulses — are left alone, and a
 * short ceiling keeps a stuck animation from hanging the test.
 */
export async function settleAnimations(page: Page, ceilingMs = 2_000) {
  await page.evaluate(
    (ceiling) =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined))
        ),
        new Promise((resolve) => setTimeout(resolve, ceiling)),
      ]),
    ceilingMs
  )
}

/**
 * WCAG contrast of every text node inside an element, each measured with
 * the colour of the element that actually paints it against what is really
 * behind it: the backgrounds up the tree composited onto the nearest opaque
 * ancestor, so translucent chips are measured honestly. Shared by every
 * screen's e2e; Home, Metrics and Product Roadmap call it on their
 * sample-data surfaces. Also reports the raw text alpha and the ancestor
 * opacity chain, so "solid colours, no opacity" can be asserted outright
 * rather than inferred from the ratio.
 */
export async function textNodeContrasts(locator: Locator): Promise<TextContrast[]> {
  await settleAnimations(locator.page())
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
    const opacityOf = (el: Element) => {
      let o = 1
      for (let node: Element | null = el; node; node = node.parentElement) {
        o *= Number(getComputedStyle(node).opacity)
      }
      return o
    }
    const rgb = ({ r, g, b }: Rgb) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`

    const out: TextContrast[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim()
      const el = n.parentElement
      if (!text || !el) continue
      const backdrop = backdropOf(el)
      const colour = parse(getComputedStyle(el).color)
      const fg = over(colour, backdrop)
      const [l1, l2] = [lum(fg), lum(backdrop)].sort((a, b) => b - a)
      out.push({
        text,
        ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
        fg: rgb(fg),
        bg: rgb(backdrop),
        alpha: Math.round(colour.a * 1000) / 1000,
        opacity: Math.round(opacityOf(el) * 1000) / 1000,
      })
    }
    return out
  })
}

/** WCAG AA for normal text. */
export const MIN_CONTRAST = 4.5

/**
 * Everything wrong with a set of measured nodes, as human-readable strings:
 * a ratio under the bar, translucent text, or any `opacity` on the way up.
 * Empty when the surface is clean. Used by `expectReadable` and by the
 * negative control below, so both agree on what "unreadable" means.
 */
export function contrastFailures(nodes: TextContrast[], label: string, minimum = MIN_CONTRAST): string[] {
  const failures: string[] = []
  for (const n of nodes) {
    const where = `${label}: "${n.text}" ${n.fg} on ${n.bg}`
    if (n.ratio < minimum) failures.push(`${where} — contrast ${n.ratio.toFixed(2)}:1 < ${minimum}:1`)
    if (n.alpha !== 1) failures.push(`${where} — text alpha ${n.alpha} (must be solid)`)
    if (n.opacity !== 1) failures.push(`${where} — opacity ${n.opacity} on the text`)
  }
  return failures
}

/**
 * Assert every text node in `locator` clears WCAG AA for normal text, with
 * solid colour and no opacity.
 */
export async function expectReadable(
  locator: Locator,
  label: string,
  expect: typeof import("@playwright/test").expect
) {
  const nodes = await textNodeContrasts(locator)
  expect(nodes.length, `${label}: text nodes measured`).toBeGreaterThan(0)
  expect(contrastFailures(nodes, label)).toEqual([])
  return nodes
}

/**
 * Negative control for the probe itself: plant three deliberately bad text
 * nodes inside `host` — too little contrast, translucent text, and a
 * half-opacity ancestor — and assert the probe reports exactly those three
 * failures, then remove them and assert the host is clean again. Run it
 * once per screen so a probe that silently passes everything is caught.
 */
export async function expectProbeCatchesBadText(
  page: Page,
  host: Locator,
  expect: typeof import("@playwright/test").expect
) {
  const IDS = ["probe-low-contrast", "probe-alpha-text", "probe-half-opacity"] as const
  await host.evaluate((root, ids) => {
    const mk = (id: string, style: string, text: string) => {
      const el = document.createElement("span")
      el.id = id
      el.setAttribute("style", style)
      el.textContent = text
      root.append(el)
    }
    mk(ids[0], "color:#9a9a9a;background:#ffffff", "Low contrast")
    mk(ids[1], "color:rgba(0,0,0,0.4);background:#ffffff", "Alpha text")
    mk(ids[2], "color:#000000;background:#ffffff;opacity:0.5", "Half opacity")
  }, IDS)

  const planted = page.locator(`#${IDS[0]}, #${IDS[1]}, #${IDS[2]}`)
  const nodes = (await Promise.all((await planted.all()).map((l) => textNodeContrasts(l)))).flat()
  const failures = contrastFailures(nodes, "negative control")
  expect(failures.some((f) => f.includes('"Low contrast"') && / — contrast 2\.\d\d:1 < 4\.5:1$/.test(f)), failures.join("\n")).toBe(true)
  expect(failures.some((f) => f.includes('"Alpha text"') && f.includes("text alpha 0.4")), failures.join("\n")).toBe(true)
  expect(failures.some((f) => f.includes('"Half opacity"') && f.includes("opacity 0.5")), failures.join("\n")).toBe(true)
  // Translucent black over white also fails the ratio, so four in total.
  expect(failures).toHaveLength(4)

  await page.evaluate((ids) => {
    for (const id of ids) document.getElementById(id)?.remove()
  }, IDS)
  await expect(planted).toHaveCount(0)
}
