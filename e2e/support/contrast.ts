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
  return locator.evaluate(async (root) => {
    // Measure what the user ends up seeing: let any finite animation on the
    // element, its subtree or its ancestors finish first (popovers fade in),
    // but never wait on an infinite one such as a skeleton's pulse.
    const animations = new Set<Animation>(root.getAnimations({ subtree: true }))
    for (let node: Element | null = root; node; node = node.parentElement) {
      for (const a of node.getAnimations()) animations.add(a)
    }
    await Promise.all(
      [...animations]
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {}))
    )

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

    // CSS `opacity` fades the text too, but never shows up in `color`;
    // multiply it into the alpha so a faded label is measured as faded.
    const opacityOf = (el: Element) => {
      let o = 1
      for (let node: Element | null = el; node; node = node.parentElement) {
        o *= Number(getComputedStyle(node).opacity)
      }
      return o
    }

    const out: { text: string; ratio: number; fg: string; bg: string }[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim()
      const el = n.parentElement
      if (!text || !el) continue
      const backdrop = backdropOf(el)
      const color = parse(getComputedStyle(el).color)
      const fg = over({ ...color, a: color.a * opacityOf(el) }, backdrop)
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

const SABOTAGE_ATTR = "data-contrast-sabotage"

/**
 * Negative control for the probe: make the text in `locator` unreadable
 * two different ways — near-transparent colour (sinks into any backdrop,
 * light or dark) and a faded ancestor — and assert the probe reports every
 * node below 4.5:1 each time. Then undo both and assert it reads well again.
 * Call it once per screen so a broken probe can never pass silently.
 */
export async function expectProbeCatchesSabotage(
  locator: Locator,
  label: string,
  expect: typeof import("@playwright/test").expect
) {
  const page = locator.page()
  const before = await expectReadable(locator, `${label} (before)`, expect)
  await locator.evaluate((el, attr) => el.setAttribute(attr, ""), SABOTAGE_ATTR)
  const styles = {
    colour: `[${SABOTAGE_ATTR}], [${SABOTAGE_ATTR}] * { color: rgb(0 0 0 / 0.06) !important; }`,
    opacity: `[${SABOTAGE_ATTR}] { opacity: 0.15 !important; }`,
  }
  for (const [kind, content] of Object.entries(styles)) {
    const style = await page.addStyleTag({ content })
    const nodes = await textNodeContrasts(locator)
    expect(nodes.length, `${label} (${kind}): text nodes measured`).toBe(before.length)
    for (const node of nodes) {
      expect(node.ratio, `${label} (${kind}): probe missed "${node.text}" ${node.fg} on ${node.bg}`).toBeLessThan(4.5)
    }
    await style.evaluate((el) => (el as HTMLElement).remove())
  }
  await locator.evaluate((el, attr) => el.removeAttribute(attr), SABOTAGE_ATTR)
  await expectReadable(locator, `${label} (after)`, expect)
}
