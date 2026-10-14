"use client"

import * as React from "react"
import Link from "next/link"

import {
  CROSSFADE_MS,
  ERROR_LABEL,
  ERROR_TOOLTIP,
  FLAP_MS,
  LOADING_LABEL,
  MAX_TILES,
  TILE_SIZES,
  announceDelay,
  deltaChip,
  flapSteps,
  formatCount,
  formatTicker,
  keyFor,
  placeholderGlyphs,
  planCascade,
  reserveGap,
  tickerLabel,
  type Direction,
  type Glyph,
  type TickerVariant,
} from "@/lib/subscriber-ticker"
import { formatWallClock } from "@/lib/clock"
import { staleLabel, type SubscriberSource, type TickerState } from "@/lib/subscriber-source"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useSubscriberTicker } from "@/hooks/use-subscriber-ticker"
import { SampleDataTag } from "@/components/sample-data"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SubscriberBreakdownView } from "@/lib/live-metrics"

/** Metrics › New Subscribers: the list behind the number. */
export const TICKER_HREF = "/metrics?tab=new"

/* ------------------------------------------------------------------ tile */

type Size = (typeof TILE_SIZES)[TickerVariant]

/** Figma 31:220: the same near-black tile in both themes, no border. */
const TILE =
  "relative inline-block flex-none overflow-hidden bg-[#131313] font-mono font-semibold text-[#F4F4F1] tabular-nums"

/** One half of a tile: the glyph is tile-height, clipped to its top or bottom. */
function Half({
  char,
  pos,
  flap,
}: {
  char: string
  pos: "top" | "bottom"
  flap?: boolean
}) {
  return (
    <span
      data-flap={flap ? pos : undefined}
      className={cn(
        "absolute inset-x-0 h-1/2 overflow-hidden",
        pos === "top" ? "top-0" : "top-1/2",
        flap && "bg-[#131313]",
        flap && pos === "top" && "ticker-flap-top shadow-[0_2px_3px_rgb(0_0_0/0.45)]",
        flap && pos === "bottom" && "ticker-flap-bottom"
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 flex h-[200%] items-center justify-center leading-none",
          pos === "top" ? "top-0" : "-top-full"
        )}
      >
        {char}
      </span>
    </span>
  )
}

/** `setTimeout` tracked in `pending`, so an unmount can clear it. */
function later(pending: Set<ReturnType<typeof setTimeout>>, ms: number, fn: () => void) {
  const id = setTimeout(() => {
    pending.delete(id)
    fn()
  }, ms)
  pending.add(id)
}

/**
 * A digit tile. It flaps from what it shows to `target` one value at a time
 * (`flapSteps`), starting `delayMs` after the target changes. A new target
 * mid-flight waits for the current flap to land, then the tile re-plans
 * from where it is: "finish the current flap, then retarget".
 */
function DigitTile({
  target,
  delayMs,
  direction,
  animate,
  enter,
  size,
  placeholder,
}: {
  target: string
  delayMs: number
  direction: Direction
  animate: boolean
  enter: boolean
  size: Size
  placeholder?: "loading" | "error"
}) {
  const [shown, setShown] = React.useState(target)
  const [flap, setFlap] = React.useState<{ from: string; to: string } | null>(null)
  const latest = React.useRef({ target, direction, shown: target })
  const busy = React.useRef(false)
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>())

  React.useEffect(() => {
    latest.current.target = target
    latest.current.direction = direction
  })

  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const id of pending) clearTimeout(id)
      pending.clear()
    }
  }, [])

  React.useEffect(() => {
    if (!animate) {
      // Reduced motion: the row crossfades; the tile just holds the value.
      latest.current.shown = target
      return
    }
    if (busy.current || latest.current.shown === target) return
    busy.current = true
    const pending = timers.current
    const step = () => {
      const from = latest.current.shown
      const [next] = flapSteps(from, latest.current.target, latest.current.direction)
      if (next === undefined) {
        busy.current = false
        return
      }
      setFlap({ from, to: next })
      later(pending, FLAP_MS, () => {
        latest.current.shown = next
        setShown(next)
        setFlap(null)
        step()
      })
    }
    later(pending, delayMs, step)
  }, [target, animate, delayMs])

  const char = animate ? shown : target
  return (
    <span
      data-tile
      className={cn(
        TILE,
        enter && animate && "ticker-enter",
        placeholder && "[&>span>span]:opacity-30",
        placeholder === "loading" && animate && "[&>span>span]:animate-[ticker-pulse_1.2s_ease-in-out_infinite]"
      )}
      style={{
        width: size.width,
        height: size.height,
        fontSize: size.font,
        borderRadius: size.radius,
      }}
    >
      <Half pos="top" char={flap ? flap.to : char} />
      <Half pos="bottom" char={flap ? flap.from : char} />
      {flap && (
        <>
          <Half pos="top" char={flap.from} flap />
          <Half pos="bottom" char={flap.to} flap />
        </>
      )}
      {/* The 5% top sheen, the 1px split and its hinge pins. */}
      <span data-tile-part="sheen" className="absolute inset-x-0 top-0 h-1/2 bg-white/5" />
      <span data-tile-part="split" className="absolute inset-x-0 top-[calc(50%-0.5px)] h-px bg-black/75" />
      <span
        data-tile-part="hinge"
        className="absolute top-[calc(50%-1.5px)] left-0 h-[3px] bg-[#4d4d4d]"
        style={{ width: size.hinge }}
      />
      <span
        data-tile-part="hinge"
        className="absolute top-[calc(50%-1.5px)] right-0 h-[3px] bg-[#4d4d4d]"
        style={{ width: size.hinge }}
      />
    </span>
  )
}

function Separator({ char, enter, animate, size }: { char: string; enter: boolean; animate: boolean; size: Size }) {
  return (
    <span
      className={cn(
        "text-muted-foreground flex-none self-end text-center font-mono leading-none font-semibold",
        enter && animate && "ticker-enter"
      )}
      style={{ width: size.separator, fontSize: size.font * 0.8 }}
    >
      {char}
    </span>
  )
}

/* ------------------------------------------------------------------- row */

type RowProps = {
  glyphs: Glyph[]
  unit: string
  value: number | null
  animate: boolean
  variant: TickerVariant
  placeholder?: "loading" | "error"
}

type Rendered = {
  glyphs: Glyph[]
  value: number | null
  direction: Direction
  delays: Map<string, number>
  entering: Set<string>
}

const textOf = (glyphs: readonly Glyph[]) => glyphs.map((g) => g.char).join("")

/**
 * The tiles, right-anchored: a tile's identity is its position from the
 * right, so growth adds tiles on the left and nothing to the right moves.
 * Each change is planned by `planCascade` (stagger, entering tiles); the
 * tiles carry out their own flaps.
 */
function TileRow({ glyphs, unit, value, animate, variant, placeholder }: RowProps) {
  const size = TILE_SIZES[variant]
  const [rendered, setRendered] = React.useState<Rendered>(() => ({
    glyphs,
    value,
    direction: "up",
    delays: new Map(),
    entering: new Set(),
  }))
  // Plan the change during render (React's "adjust state when a prop
  // changes" pattern), so the tiles get their delays with their targets.
  if (textOf(rendered.glyphs) !== textOf(glyphs)) {
    const direction: Direction =
      value !== null && rendered.value !== null && value < rendered.value ? "down" : "up"
    const plan = planCascade(rendered.glyphs, glyphs, direction)
    setRendered({
      glyphs,
      value,
      direction,
      delays: new Map(plan.tiles.map((t) => [t.key, t.delayMs])),
      entering: new Set(plan.tiles.filter((t) => t.enter).map((t) => t.key)),
    })
  }

  return (
    <span
      className="flex items-center justify-end"
      style={{ gap: size.gap, height: size.height }}
    >
      {glyphs.map((g, i) => {
        const key = keyFor(glyphs.length - 1 - i, g.kind)
        const enter = rendered.entering.has(key)
        return g.kind === "digit" ? (
          <DigitTile
            key={key}
            target={g.char}
            delayMs={rendered.delays.get(key) ?? 0}
            direction={rendered.direction}
            animate={animate}
            enter={enter}
            size={size}
            placeholder={placeholder}
          />
        ) : (
          <Separator key={key} char={g.char} enter={enter} animate={animate} size={size} />
        )
      })}
      {unit && (
        <span
          className="text-muted-foreground flex-none self-end pl-0.5 font-mono leading-none font-semibold"
          style={{ fontSize: size.font * 0.8 }}
        >
          {unit}
        </span>
      )}
    </span>
  )
}

/**
 * Reduced motion: no flaps. The whole number crossfades old → new over
 * 150ms (opacity only); the old layer is dropped once it has faded.
 */
function Crossfade(props: RowProps) {
  const text = `${textOf(props.glyphs)}${props.unit}`
  const [layers, setLayers] = React.useState({
    text,
    row: props,
    previous: null as RowProps | null,
    fresh: false,
  })
  if (layers.text !== text) {
    setLayers({ text, row: props, previous: layers.row, fresh: true })
  }
  React.useEffect(() => {
    if (!layers.previous) return
    const id = setTimeout(() => setLayers((l) => ({ ...l, previous: null })), CROSSFADE_MS)
    return () => clearTimeout(id)
  }, [layers.previous])

  return (
    <span className="relative inline-flex">
      <span key={text} className={cn("inline-flex", layers.fresh && "ticker-fade-in")}>
        <TileRow {...props} />
      </span>
      {layers.previous && (
        <span className="ticker-fade-out pointer-events-none absolute inset-y-0 right-0 inline-flex">
          <TileRow {...layers.previous} />
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------- breakdown */

/**
 * The tooltip's body: the total and its four groups. Inverted colours
 * (the shared tooltip is foreground-on-background), so no muted tokens.
 */
function BreakdownTip({ total, view }: { total: string; view: SubscriberBreakdownView }) {
  return (
    <div data-testid="ticker-breakdown" className="flex min-w-52 flex-col gap-1 py-0.5 text-left">
      <p className="flex items-baseline justify-between gap-4 font-semibold">
        <span>Subscribers</span>
        <span className="tabular-nums">{total}</span>
      </p>
      <dl className="flex flex-col gap-0.5">
        {view.rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-4">
            <dt className="opacity-75">{row.label}</dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.note && <p className="opacity-75">{view.note}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- ticker */

/**
 * The text the live region holds: `label`, but changed at most once a
 * minute (`announceDelay`), so a busy count is not read out on every
 * sign-up. A change inside the minute waits, and the latest label wins.
 */
function useAnnouncement(label: string) {
  const [announced, setAnnounced] = React.useState({ text: label, at: null as number | null })
  // Loading → the first figure is the page settling, not a change: it takes
  // the region's text without starting the once-a-minute clock, so the
  // first real change is spoken straight away.
  if (announced.text === LOADING_LABEL && label !== LOADING_LABEL) {
    setAnnounced({ text: label, at: null })
  }
  React.useEffect(() => {
    if (label === announced.text) return
    const id = setTimeout(
      () => setAnnounced({ text: label, at: Date.now() }),
      announceDelay(announced.at, Date.now())
    )
    return () => clearTimeout(id)
  }, [label, announced])
  return announced.text
}

function rowFor(state: TickerState, maxTiles: number) {
  if (state.status === "loading" || state.status === "error") {
    return { glyphs: placeholderGlyphs(), unit: "", value: null, placeholder: state.status }
  }
  const d = formatTicker(state.reading.total, maxTiles)
  return { glyphs: d.glyphs, unit: d.unit, value: state.reading.total, placeholder: undefined }
}

/**
 * The Grand Central subscriber ticker (option A). `header` is the Home
 * header from tablet up ("Subscribers" + up to 7 tiles); `bar` is the phone
 * top bar (tiles only, up to 5, with the compact Sample chip). Both read
 * one shared store, so they always show the same number.
 *
 * role=status + aria-live=polite carries the figure as sr-only text (no
 * aria-label of its own, spoken at most once a minute); the tiles are
 * aria-hidden. Only the total is ever announced.
 *
 * With Stripe live, the total's breakdown (Stripe paying, App Store,
 * invoice, free accounts) is the link's accessible description (`aria-describedby`, a
 * hidden copy, so it is read on focus and never announced), and a tooltip
 * on hover or keyboard focus. The tooltip is portalled: nothing in the
 * header moves when it opens.
 * Click (or tap) goes to Metrics › New Subscribers.
 */
export function SubscriberTicker({
  variant,
  className,
  source,
}: {
  variant: TickerVariant
  className?: string
  /** Pins the ticker to one source (tests); by default it follows Stripe. */
  source?: SubscriberSource
}) {
  const { state, refresh, sample, timeZone, breakdown } = useSubscriberTicker(source)
  const describedBy = `${React.useId()}-breakdown`
  const reduced = useReducedMotion()
  const row = rowFor(state, MAX_TILES[variant])
  const loading = state.status === "loading"
  const failed = state.status === "error"
  const stale = state.status === "stale" ? state.reading.at : null
  const reading = state.status === "ready" || state.status === "stale" ? state.reading : null

  const label = reading
    ? `${tickerLabel(reading.total, reading.today)}${stale ? `, ${staleLabel(stale, timeZone)}` : ""}`
    : failed
      ? ERROR_LABEL
      : LOADING_LABEL
  const announced = useAnnouncement(label)
  const chip = state.status === "ready" ? deltaChip(state.reading.today) : null
  // Loading / error tiles and a first good value render settled: a new
  // `mode` remounts the row, so nothing cascades out of a placeholder.
  const mode = reading ? "value" : state.status
  const header = variant === "header"

  return (
    <div
      data-testid="subscriber-ticker"
      data-variant={variant}
      data-state={state.status}
      className={cn("flex min-w-0 flex-none items-center", header ? "gap-2.5" : "gap-0.5", className)}
    >
      {/* Room for four digits, kept on the far left: the ticker is
          right-anchored, so growth to 1,000 moves nothing. */}
      <span aria-hidden className="flex-none" style={{ width: reserveGap(row.glyphs, variant) }} />
      {sample && <SampleDataTag compact={!header} className={cn(header && "h-6 px-2")} />}
      <Tooltip disabled={!breakdown}>
        {/* The link is named outright: Chromium does not name a link from
            text inside a live region, and the region's copy may lag. */}
        <TooltipTrigger
          delay={150}
          render={<Link href={TICKER_HREF} />}
          aria-label={label}
          aria-describedby={breakdown ? describedBy : undefined}
          className={cn(
            "focus-visible:ring-ring/50 flex flex-none items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none",
            // Bar: no side padding, so 99,999 fits a 360 phone (the tiles are 44+ wide).
            header ? "gap-2 px-1 max-xl:min-h-11" : "min-h-11 min-w-11 justify-center"
          )}
        >
          <span
            role="status"
            aria-live="polite"
            aria-busy={loading}
            className="flex items-center gap-2"
          >
            <span className="sr-only">{announced}</span>
            {header && (
              <span aria-hidden className="text-caption text-muted-foreground font-medium tracking-tight">
                Subscribers
              </span>
            )}
            <span aria-hidden data-testid="ticker-tiles" className="inline-flex">
              {reduced ? (
                <Crossfade key={mode} {...row} animate={false} variant={variant} />
              ) : (
                <TileRow key={mode} {...row} animate variant={variant} />
              )}
            </span>
            {stale && (
              <span
                aria-hidden
                title={formatWallClock(stale, timeZone)}
                className="text-muted-foreground text-[11px] leading-none whitespace-nowrap max-md:hidden"
              >
                {staleLabel(stale, timeZone)}
              </span>
            )}
            {chip && header && (
              <span
                aria-hidden
                className="bg-success/10 text-success-text text-caption rounded-full px-1.5 py-[3px] leading-[1.2] font-medium tabular-nums"
              >
                {chip}
              </span>
            )}
          </span>
        </TooltipTrigger>
        {breakdown && reading && (
          <TooltipContent side="bottom" align="end" sideOffset={6}>
            <BreakdownTip total={formatCount(reading.total)} view={breakdown.view} />
          </TooltipContent>
        )}
      </Tooltip>
      {breakdown && (
        <span id={describedBy} hidden>
          {breakdown.text}
        </span>
      )}
      {failed && (
        <button
          type="button"
          onClick={refresh}
          aria-label={ERROR_TOOLTIP}
          title={ERROR_TOOLTIP}
          className="focus-visible:ring-ring/50 flex size-11 flex-none items-center justify-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none xl:size-6"
        >
          <span aria-hidden className="bg-destructive size-2 rounded-full" />
        </button>
      )}
    </div>
  )
}
