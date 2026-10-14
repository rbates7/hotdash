/**
 * The Home subscriber ticker (Grand Central split-flap, option A): every
 * rule the tiles follow, kept pure so it can be tested without a browser.
 *
 * - **Formatting.** Up to 7 digits as tiles ("9,999,999"); from 10M the
 *   compact form "12.4M". The phone bar allows 5 digit tiles, then "128K".
 *   Compact figures are floored, so the board never shows more subscribers
 *   than there are (and 999,999 never rounds up to "1000K").
 * - **Diff.** Old and new glyphs line up from the right (the ticker is
 *   right-anchored), and only the digits that changed move.
 * - **Steps.** A digit flaps through its intermediate values (4→5→6 is two
 *   flaps); more than 6 flaps and it jumps straight to the target.
 * - **Cascade.** Changed digits start right-to-left, ones first, 40ms apart;
 *   when the number grows, the new leading tiles slide in first (120ms).
 */

/* ----------------------------------------------------------- timing */

/** One flap: the old top half falls (30ms), the new bottom half lands (30ms). */
export const FLAP_MS = 60
export const FLAP_HALF_MS = FLAP_MS / 2
/** Gap between neighbouring digits starting, right to left. */
export const STAGGER_MS = 40
/** New leading tiles (and their comma) slide in before the cascade. */
export const ENTER_MS = 120
/** Reduced motion: the whole number crossfades instead. */
export const CROSSFADE_MS = 150
/** More flaps than this and a digit jumps straight to its target. */
export const MAX_STEPS = 6

/* ------------------------------------------------------- breakpoints */

/**
 * Where the ticker sits. `bar` is the phone top bar (< 768); `header` is the
 * Home header from tablet up.
 */
export type TickerVariant = "bar" | "header"

/** Digit tiles before switching to the compact form. */
export const MAX_TILES: Record<TickerVariant, number> = { bar: 5, header: 7 }

/** Matches `PHONE_MAX_WIDTH` in use-mobile: the top bar is phone-only. */
export const BAR_MAX_WIDTH = 767

export function variantForWidth(width: number): TickerVariant {
  return width <= BAR_MAX_WIDTH ? "bar" : "header"
}

/** How many digit tiles the ticker may show at a viewport width. */
export function maxTilesForWidth(width: number) {
  return MAX_TILES[variantForWidth(width)]
}

/**
 * Tile geometry per variant, in px. Radius is ~13% of the tile width (the
 * spec allows 12–14%).
 */
export const TILE_SIZES: Record<
  TickerVariant,
  { width: number; height: number; font: number; gap: number; separator: number; radius: number }
> = {
  header: { width: 22, height: 30, font: 19, gap: 3, separator: 7, radius: 3 },
  bar: { width: 15, height: 21, font: 13, gap: 2, separator: 5, radius: 2 },
}

/** Digits the ticker always has room for, so small counts never reflow the header. */
export const RESERVED_DIGITS = 4

/**
 * Minimum width of the tile row: `digits` tiles plus the comma a 4-digit
 * count carries. Growth past it extends to the left.
 */
export function reservedWidth(variant: TickerVariant, digits = RESERVED_DIGITS) {
  const s = TILE_SIZES[variant]
  const separators = Math.floor((digits - 1) / 3)
  const items = digits + separators
  return digits * s.width + separators * s.separator + (items - 1) * s.gap
}

/* -------------------------------------------------------- formatting */

/** Painted width of a tile row (digit tiles, separators and the gaps between). */
export function rowWidth(glyphs: readonly Glyph[], variant: TickerVariant) {
  if (glyphs.length === 0) return 0
  const s = TILE_SIZES[variant]
  const body = glyphs.reduce((w, g) => w + (g.kind === "digit" ? s.width : s.separator), 0)
  return body + (glyphs.length - 1) * s.gap
}

/**
 * Empty space the ticker keeps on its far left so a short count ("186")
 * takes the room of "1,284". It sits before the label, not between the
 * label and the tiles, so "Subscribers" always hugs its number.
 */
export function reserveGap(glyphs: readonly Glyph[], variant: TickerVariant) {
  return Math.max(0, reservedWidth(variant) - rowWidth(glyphs, variant))
}

export type GlyphKind = "digit" | "separator"

export type Glyph = { kind: GlyphKind; char: string }

export type TickerDisplay = {
  glyphs: Glyph[]
  /** "K" or "M" (or "B") in the compact form, otherwise empty. */
  unit: string
  compact: boolean
  /** The figure as read aloud and in tooltips: "1,284", "12.4M". */
  text: string
}

const GROUPED = new Intl.NumberFormat("en-US")

/** "1,284" — the full figure, for labels. */
export function formatCount(n: number) {
  return GROUPED.format(Math.trunc(n))
}

const UNITS = [
  { unit: "B", value: 1_000_000_000 },
  { unit: "M", value: 1_000_000 },
  { unit: "K", value: 1_000 },
] as const

/**
 * The compact form, floored: one decimal under 100 of the unit ("12.4M",
 * "1.2M"), whole above ("128K"). A trailing ".0" stays so the tile count
 * does not jump while the count climbs through a unit.
 */
export function formatCompact(n: number) {
  const abs = Math.abs(Math.trunc(n))
  const sign = n < 0 ? "-" : ""
  const u = UNITS.find((x) => abs >= x.value)
  if (!u) return { text: `${sign}${abs}`, unit: "" }
  const scaled = abs / u.value
  const body =
    scaled < 100 ? (Math.floor(scaled * 10) / 10).toFixed(1) : String(Math.floor(scaled))
  return { text: `${sign}${body}`, unit: u.unit }
}

function digitCount(n: number) {
  return String(Math.abs(Math.trunc(n))).length
}

function toGlyphs(text: string): Glyph[] {
  return [...text].map((char) => ({
    kind: /\d/.test(char) ? "digit" : "separator",
    char,
  }))
}

/** What the tiles show for `n` with at most `maxTiles` digit tiles. */
export function formatTicker(n: number, maxTiles: number): TickerDisplay {
  if (digitCount(n) <= maxTiles) {
    const text = formatCount(n)
    return { glyphs: toGlyphs(text), unit: "", compact: false, text }
  }
  const { text, unit } = formatCompact(n)
  return { glyphs: toGlyphs(text), unit, compact: true, text: `${text}${unit}` }
}

/** En-dash tiles while loading or before the first good value: "–,–––". */
export function placeholderGlyphs(digits = RESERVED_DIGITS): Glyph[] {
  const out: Glyph[] = []
  for (let i = digits - 1; i >= 0; i--) {
    out.push({ kind: "digit", char: "–" })
    if (i > 0 && i % 3 === 0) out.push({ kind: "separator", char: "," })
  }
  return out
}

/* ------------------------------------------------------------- diff */

export type Direction = "up" | "down"

/** The position of a glyph counted from the right (0 = ones). */
export function keyFor(fromRight: number, kind: GlyphKind) {
  return `r${fromRight}-${kind}`
}

export type TileChange = {
  key: string
  fromRight: number
  kind: GlyphKind
  /** Null when the position is new: the number grew. */
  from: string | null
  /** Null when the position is gone: the number shrank. */
  to: string | null
  changed: boolean
}

/**
 * Line `prev` and `next` up from the right. A position whose kind changed
 * (a digit where a comma was, after a format switch) is a new tile, so it
 * enters rather than flapping a comma into a digit.
 */
export function diffGlyphs(prev: readonly Glyph[], next: readonly Glyph[]): TileChange[] {
  const len = Math.max(prev.length, next.length)
  const out: TileChange[] = []
  for (let i = 0; i < len; i++) {
    const p = prev[prev.length - 1 - i]
    const n = next[next.length - 1 - i]
    if (p && n && p.kind === n.kind) {
      out.push({
        key: keyFor(i, n.kind),
        fromRight: i,
        kind: n.kind,
        from: p.char,
        to: n.char,
        changed: p.char !== n.char,
      })
      continue
    }
    if (p) {
      out.push({ key: keyFor(i, p.kind), fromRight: i, kind: p.kind, from: p.char, to: null, changed: true })
    }
    if (n) {
      out.push({ key: keyFor(i, n.kind), fromRight: i, kind: n.kind, from: null, to: n.char, changed: true })
    }
  }
  return out
}

/* ------------------------------------------------------------ steps */

const isDigit = (c: string) => /^\d$/.test(c)

/**
 * The glyphs a tile shows on its way from `from` to `to`, excluding `from`
 * itself: 4→6 up is ["5", "6"]. Digits roll the way the count moved — up
 * rolls forward through 9→0, down rolls back — and anything that is not a
 * digit-to-digit roll, or would take more than `MAX_STEPS` flaps, is one
 * flap straight to the target.
 */
export function flapSteps(from: string, to: string, direction: Direction = "up"): string[] {
  if (from === to) return []
  if (!isDigit(from) || !isDigit(to)) return [to]
  const a = Number(from)
  const b = Number(to)
  const forward = direction === "up"
  const count = forward ? (b - a + 10) % 10 : (a - b + 10) % 10
  if (count > MAX_STEPS) return [to]
  return Array.from({ length: count }, (_, i) => String((forward ? a + i + 1 : a - i - 1 + 10) % 10))
}

/* ---------------------------------------------------------- cascade */

export type TilePlan = {
  key: string
  fromRight: number
  kind: GlyphKind
  /** The glyph the tile ends on. */
  to: string
  /** The tile is new this change: it slides in rather than flapping. */
  enter: boolean
  /** When its first flap starts, from the moment the new value arrives. */
  delayMs: number
  /** Flaps it will make (empty for unchanged and entering tiles). */
  steps: string[]
}

export type CascadePlan = {
  tiles: TilePlan[]
  direction: Direction
  /** When the last flap lands. */
  totalMs: number
}

/**
 * The schedule for one change: which tiles enter, which flap and when.
 * Unchanged tiles never move. Leaving tiles are dropped (the number shrank;
 * they go with the change). Changed digits start right-to-left with a
 * 40ms stagger — ones first — after the entering tiles have slid in.
 */
export function planCascade(
  prev: readonly Glyph[],
  next: readonly Glyph[],
  direction: Direction
): CascadePlan {
  const changes = diffGlyphs(prev, next).filter((c) => c.to !== null)
  const entering = changes.some((c) => c.from === null)
  const lead = entering ? ENTER_MS : 0
  let rank = 0
  let totalMs = entering ? ENTER_MS : 0
  const tiles: TilePlan[] = changes.map((c) => {
    const enter = c.from === null
    const steps = enter || !c.changed ? [] : flapSteps(c.from!, c.to!, direction)
    let delayMs = 0
    if (steps.length > 0) {
      delayMs = lead + rank * STAGGER_MS
      rank += 1
      totalMs = Math.max(totalMs, delayMs + steps.length * FLAP_MS)
    }
    return { key: c.key, fromRight: c.fromRight, kind: c.kind, to: c.to!, enter, delayMs, steps }
  })
  // Left to right, the order the tiles render in.
  tiles.sort((a, b) => b.fromRight - a.fromRight)
  return { tiles, direction, totalMs }
}

/* ------------------------------------------------------------ labels */

/** "up 3 today" / "down 2 today" / "no change today". */
export function todayPhrase(today: number) {
  if (today > 0) return `up ${formatCount(today)} today`
  if (today < 0) return `down ${formatCount(-today)} today`
  return "no change today"
}

/** "+3" / "−2" for the delta chip; null when flat (no chip). */
export function deltaChip(today: number) {
  if (today > 0) return `+${formatCount(today)}`
  if (today < 0) return `−${formatCount(-today)}`
  return null
}

/** The status label: "Subscribers: 1,284, up 3 today". Always the full figure. */
export function tickerLabel(total: number, today: number) {
  return `Subscribers: ${formatCount(total)}, ${todayPhrase(today)}`
}

export const LOADING_LABEL = "Loading subscriber count"
export const ERROR_TOOLTIP = "Couldn’t load subscribers · Retry"
export const ERROR_LABEL = "Subscribers: couldn’t load the count. Retrying."
