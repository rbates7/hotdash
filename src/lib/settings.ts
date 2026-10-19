/**
 * Settings v1: the founder's preferences, saved in this browser through the
 * shared `createStorage` (same policy as every screen: SSR safe, a copy
 * that fails validation is ignored for the defaults and parked on the next
 * save, other tabs are heard through `subscribe`).
 *
 * Appearance is not stored here: next-themes owns it (and its own key), so
 * the sidebar toggle and Settings can never disagree.
 *
 * Everything below is pure; the React side is `useSettings`.
 */

import { DEFAULT_TIME_ZONE, isTimeZoneId, type TimeZoneId } from "@/lib/clock"
import { HOME_HREF, navItems, type NavItem } from "@/lib/nav"
import { createStorage, dedupe } from "@/lib/persistence"

/* ---------------------------------------------------------------- types */

export type Appearance = "light" | "dark" | "system"

export const APPEARANCE_OPTIONS: readonly { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match device" },
]

export function isAppearance(value: unknown): value is Appearance {
  return APPEARANCE_OPTIONS.some((o) => o.value === value)
}

/** Null means "not set yet"; nothing compares against an unset goal. */
export type Goals = {
  /** Whole dollars per month. */
  monthlyRevenue: number | null
  /** Percent, 0–100. */
  trialToPaid: number | null
  /** Percent, 0–100. */
  churnLimit: number | null
}

export type GoalField = keyof Goals

export type SidebarPrefs = {
  /** Screen hrefs, top to bottom. Normalized against `navItems` on read. */
  order: string[]
  /** Screen hrefs not shown in the sidebar. Never includes Home. */
  hidden: string[]
}

export type Settings = {
  timeZone: TimeZoneId
  goals: Goals
  sidebar: SidebarPrefs
}

export const SETTINGS_KEY = "hotdash.settings.v1"

/* --------------------------------------------------------------- sidebar */

/** The screens the founder can show, hide and reorder; external links stay pinned last. */
export function customizableItems(items: readonly NavItem[] = navItems): NavItem[] {
  return items.filter((item) => !item.external)
}

export function defaultSidebar(items: readonly NavItem[] = navItems): SidebarPrefs {
  return { order: customizableItems(items).map((i) => i.href), hidden: [] }
}

export function canHide(href: string) {
  return href !== HOME_HREF
}

/**
 * A stored order made safe against the current nav: unknown hrefs (a
 * screen that was removed) drop out, duplicates collapse, and screens added
 * since land in their default position relative to their default neighbour.
 */
export function normalizeOrder(order: readonly string[], items: readonly NavItem[] = navItems): string[] {
  const known = customizableItems(items).map((i) => i.href)
  const out = dedupe(order.filter((href) => known.includes(href)))
  known.forEach((href, index) => {
    if (out.includes(href)) return
    // Insert after the nearest earlier default neighbour that is present.
    const before = known.slice(0, index).reverse().find((h) => out.includes(h))
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, href)
  })
  return out
}

export function normalizeSidebar(prefs: SidebarPrefs, items: readonly NavItem[] = navItems): SidebarPrefs {
  const order = normalizeOrder(prefs.order, items)
  return { order, hidden: dedupe(prefs.hidden.filter((h) => order.includes(h) && canHide(h))) }
}

/** Every screen in the founder's order, each flagged hidden or not. */
export function sidebarRows(prefs: SidebarPrefs, items: readonly NavItem[] = navItems) {
  const { order, hidden } = normalizeSidebar(prefs, items)
  const byHref = new Map(items.map((i) => [i.href, i]))
  return order.map((href) => ({ item: byHref.get(href)!, hidden: hidden.includes(href) }))
}

/** What the sidebar renders: visible screens in order, then external links. */
export function visibleNavItems(prefs: SidebarPrefs, items: readonly NavItem[] = navItems): NavItem[] {
  return [
    ...sidebarRows(prefs, items)
      .filter((row) => !row.hidden)
      .map((row) => row.item),
    ...items.filter((item) => item.external),
  ]
}

/** Move `href` one place up (-1) or down (+1); a no-op at either end. */
export function moveScreen(prefs: SidebarPrefs, href: string, delta: -1 | 1, items: readonly NavItem[] = navItems): SidebarPrefs {
  const normalized = normalizeSidebar(prefs, items)
  const order = [...normalized.order]
  const from = order.indexOf(href)
  const to = from + delta
  if (from < 0 || to < 0 || to >= order.length) return normalized
  ;[order[from], order[to]] = [order[to], order[from]]
  return { ...normalized, order }
}

/** Show or hide `href`. Home always stays visible. */
export function setScreenHidden(prefs: SidebarPrefs, href: string, hidden: boolean, items: readonly NavItem[] = navItems): SidebarPrefs {
  const normalized = normalizeSidebar(prefs, items)
  if (hidden && !canHide(href)) return normalized
  const rest = normalized.hidden.filter((h) => h !== href)
  return normalizeSidebar({ order: normalized.order, hidden: hidden ? [...rest, href] : rest }, items)
}

export function isDefaultSidebar(prefs: SidebarPrefs, items: readonly NavItem[] = navItems) {
  const a = normalizeSidebar(prefs, items)
  const b = defaultSidebar(items)
  return a.hidden.length === 0 && a.order.join("|") === b.order.join("|")
}

/* ----------------------------------------------------------------- goals */

export const GOAL_LIMITS = {
  /** A sanity ceiling, so a stray extra zero is caught. */
  monthlyRevenueMax: 100_000_000,
} as const

export const GOAL_FIELDS: readonly GoalField[] = ["monthlyRevenue", "trialToPaid", "churnLimit"]

export type GoalCheck = { ok: true; value: number | null } | { ok: false; error: string }

/**
 * Validate what the founder typed for one goal. Blank clears it (not set).
 * Revenue accepts "$12,500" as well as "12500"; percentages accept "4.5"
 * or "4.5%".
 */
export function checkGoal(field: GoalField, raw: string): GoalCheck {
  const text = raw.trim()
  if (text === "") return { ok: true, value: null }
  if (field === "monthlyRevenue") {
    const digits = text.replace(/^\$/, "").replace(/,/g, "")
    if (!/^\d+$/.test(digits)) {
      return { ok: false, error: "Enter a whole-dollar amount, like 25000." }
    }
    const value = Number(digits)
    if (value <= 0) return { ok: false, error: "The revenue goal must be more than $0." }
    if (value > GOAL_LIMITS.monthlyRevenueMax) {
      return { ok: false, error: "That is more than $100,000,000 a month. Check for an extra zero." }
    }
    return { ok: true, value }
  }
  const number = text.replace(/%$/, "").trim()
  if (!/^\d+(\.\d+)?$/.test(number)) {
    return { ok: false, error: "Enter a percentage from 0 to 100, like 4.5." }
  }
  const value = Number(number)
  if (value > 100) return { ok: false, error: "A percentage can't be more than 100." }
  return { ok: true, value: Math.round(value * 10) / 10 }
}

export type GoalDraft = Record<GoalField, string>

export type GoalsCheck =
  | { ok: true; goals: Goals }
  | { ok: false; errors: Partial<Record<GoalField, string>> }

/** All three at once: valid only when every field is. */
export function checkGoals(draft: GoalDraft): GoalsCheck {
  const errors: Partial<Record<GoalField, string>> = {}
  const goals = { ...DEFAULT_GOALS }
  for (const field of GOAL_FIELDS) {
    const result = checkGoal(field, draft[field])
    if (result.ok) goals[field] = result.value
    else errors[field] = result.error
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, goals }
}

/** A stored goal back into the text the input shows. */
export function goalDraft(goals: Goals): GoalDraft {
  return {
    monthlyRevenue: goals.monthlyRevenue === null ? "" : String(goals.monthlyRevenue),
    trialToPaid: goals.trialToPaid === null ? "" : String(goals.trialToPaid),
    churnLimit: goals.churnLimit === null ? "" : String(goals.churnLimit),
  }
}

/** "$25,000", "4.5%", or "Not set". */
export function formatGoal(field: GoalField, value: number | null) {
  if (value === null) return "Not set"
  if (field === "monthlyRevenue") return `$${value.toLocaleString("en-US")}`
  return `${value}%`
}

/* -------------------------------------------------------------- defaults */

export const DEFAULT_GOALS: Goals = { monthlyRevenue: null, trialToPaid: null, churnLimit: null }

export const DEFAULT_SETTINGS: Settings = {
  timeZone: DEFAULT_TIME_ZONE,
  goals: DEFAULT_GOALS,
  sidebar: defaultSidebar(),
}

/* ---------------------------------------------------------------- parse */

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string")

function parseGoal(field: GoalField, v: unknown): number | null | undefined {
  if (v === null) return null
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined
  const check = checkGoal(field, String(v))
  return check.ok ? check.value : undefined
}

/**
 * A stored copy into `Settings`, or null when any field is malformed (the
 * screen then shows defaults and the copy is parked on the next save). The
 * sidebar order is normalized, not rejected, so adding a screen to the nav
 * never throws a founder's order away.
 */
export function parseSettings(value: unknown): Settings | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  // An older copy may still carry `sampleData` (the dropped "Show Sample data
  // labels" switch); it is read past, not rejected, and goes on the next save.
  if (!isTimeZoneId(v.timeZone)) return null

  const g = v.goals as Record<string, unknown> | null
  if (!g || typeof g !== "object") return null
  const goals = {} as Goals
  for (const field of GOAL_FIELDS) {
    const parsed = parseGoal(field, g[field])
    if (parsed === undefined) return null
    goals[field] = parsed
  }

  const s = v.sidebar as Record<string, unknown> | null
  if (!s || typeof s !== "object" || !isStringArray(s.order) || !isStringArray(s.hidden)) return null

  return {
    timeZone: v.timeZone,
    goals,
    sidebar: normalizeSidebar({ order: s.order, hidden: s.hidden }),
  }
}

export const settingsStorage = createStorage<Settings>({
  key: SETTINGS_KEY,
  parse: parseSettings,
})
