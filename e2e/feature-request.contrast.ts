import type { Page } from "@playwright/test"

/**
 * Feature-local contrast probe. Metrics (#11) is consolidating a shared one;
 * this file is kept isolated so it can be swapped for it in one import.
 */
export type TextContrast = {
  /** Which label the node belongs to: tag, badge or notice. */
  label: string
  text: string
  /** WCAG 2.x contrast ratio of the text colour over its effective background. */
  ratio: number
  /** Alpha of the computed text colour; 1 means no translucency on the text. */
  textAlpha: number
  /** Product of `opacity` up the ancestor chain; 1 means none applied. */
  opacity: number
}

export const SAMPLE_DATA_SELECTOR =
  '[data-testid="sample-data-tag"], [data-testid="sample-data-badge"], [role="note"][aria-label="Sample data"]'

/**
 * WCAG contrast of every text node inside the sample-data labels, measured
 * in the browser: the node's computed colour against its *effective*
 * background (ancestor backgrounds composited until opaque). Any colour
 * syntax works because each value is rasterised through a canvas first.
 */
export function measureSampleDataText(page: Page): Promise<TextContrast[]> {
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
  }, SAMPLE_DATA_SELECTOR)
}
