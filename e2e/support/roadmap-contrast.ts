import type { Page } from "@playwright/test"

/**
 * Per-text-node WCAG contrast probe for the Product Roadmap's sample-data
 * surfaces. Small and local to this screen on purpose: the shared helper
 * lands with Metrics and this file gets swapped for it.
 */

/** The surfaces that must clear 4.5:1 in both themes. */
export const SAMPLE_SURFACES =
  '[data-testid="sample-data-tag"], [data-testid="sample-data-badge"], [role="note"][aria-label="Sample data"]'

export type TextContrast = {
  /** Which surface the node sits in: the testid, or "sample-data-notice". */
  label: string
  text: string
  /** WCAG 2.x contrast ratio of the text colour against its effective background. */
  ratio: number
  /** Alpha of the computed text colour; must be 1. */
  textAlpha: number
  /** Product of `opacity` up the ancestor chain; must be 1. */
  opacity: number
}

/**
 * Walks every text node inside the sample-data surfaces and measures its
 * computed colour against its *effective* background — ancestor backgrounds
 * composited until opaque, then over white. Every colour is rasterised
 * through a 1×1 canvas first, so `oklch(...)` (which Chromium hands back
 * unconverted from `getComputedStyle`) works the same as `rgb(...)`.
 */
export async function measureSampleDataText(page: Page): Promise<TextContrast[]> {
  return page.evaluate((selector) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    type Rgba = [number, number, number, number]
    const toRgba = (css: string): Rgba => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    // `top` over `under`, both straight (non-premultiplied) RGBA.
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3])
      if (a === 0) return [0, 0, 0, 0]
      const ch = (i: number) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a
      return [ch(0), ch(1), ch(2), a]
    }
    const luminance = ([r, g, b]: Rgba) => {
      const lin = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    const effectiveBackground = (start: Element): Rgba => {
      let acc: Rgba = [0, 0, 0, 0]
      for (let el: Element | null = start; el && acc[3] < 1; el = el.parentElement) {
        acc = over(acc, toRgba(getComputedStyle(el).backgroundColor))
      }
      return over(acc, [255, 255, 255, 1])
    }
    const chainOpacity = (start: Element) => {
      let o = 1
      for (let el: Element | null = start; el; el = el.parentElement) {
        o *= Number(getComputedStyle(el).opacity)
      }
      return o
    }

    const out: TextContrast[] = []
    for (const root of document.querySelectorAll(selector)) {
      const label = root.getAttribute("data-testid") ?? "sample-data-notice"
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? ""
        if (!text) continue
        const el = node.parentElement!
        const fg = toRgba(getComputedStyle(el).color)
        const bg = effectiveBackground(el)
        const l1 = luminance(fg)
        const l2 = luminance(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        out.push({ label, text, ratio, textAlpha: fg[3], opacity: chainOpacity(el) })
      }
    }
    return out
  }, SAMPLE_SURFACES)
}

/** The bar every node must clear, and the two "no cheating" conditions. */
export function contrastFailures(nodes: TextContrast[], minimum = 4.5): string[] {
  const failures: string[] = []
  for (const n of nodes) {
    const where = `${n.label} · "${n.text}"`
    if (n.textAlpha !== 1) failures.push(`${where}: text alpha ${n.textAlpha} (must be opaque)`)
    if (n.opacity !== 1) failures.push(`${where}: opacity ${n.opacity} on the text`)
    if (n.ratio < minimum) failures.push(`${where}: contrast ${n.ratio.toFixed(2)}:1 < ${minimum}:1`)
  }
  return failures
}
