import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import { HOME_HREF, navItems } from "@/lib/nav"
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  checkGoal,
  checkGoals,
  customizableItems,
  defaultSidebar,
  formatGoal,
  goalDraft,
  isDefaultSidebar,
  moveScreen,
  normalizeOrder,
  normalizeSidebar,
  parseSettings,
  setScreenHidden,
  settingsStorage,
  sidebarRows,
  visibleNavItems,
  type Settings,
} from "@/lib/settings"
import { quotaExceededStorage } from "@/test/storage"

const screens = customizableItems().map((i) => i.href)

describe("defaults", () => {
  it("start in Central, goals unset and the default sidebar; there is no Sample data labels setting", () => {
    expect(DEFAULT_SETTINGS.timeZone).toBe(CENTRAL)
    expect(DEFAULT_SETTINGS).not.toHaveProperty("sampleData")
    expect(DEFAULT_SETTINGS.goals).toEqual({ monthlyRevenue: null, trialToPaid: null, churnLimit: null })
    expect(DEFAULT_SETTINGS.sidebar.order).toEqual(screens)
    expect(DEFAULT_SETTINGS.sidebar.hidden).toEqual([])
  })

  it("leave external links out of the customizable screens", () => {
    expect(screens).not.toContain("https://chlkapp.com")
    expect(screens[0]).toBe(HOME_HREF)
  })
})

describe("checkGoal", () => {
  it("accepts whole dollars, with or without $ and commas", () => {
    expect(checkGoal("monthlyRevenue", "25000")).toEqual({ ok: true, value: 25000 })
    expect(checkGoal("monthlyRevenue", " $25,000 ")).toEqual({ ok: true, value: 25000 })
  })

  it("rejects zero, negatives, decimals, words and absurd revenue", () => {
    for (const raw of ["0", "-5", "12.5", "abc", "1e5", "$", "100000001"]) {
      const result = checkGoal("monthlyRevenue", raw)
      expect(result.ok, raw).toBe(false)
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it("accepts 0–100 percentages with a trailing % and one decimal", () => {
    expect(checkGoal("trialToPaid", "0")).toEqual({ ok: true, value: 0 })
    expect(checkGoal("trialToPaid", "100")).toEqual({ ok: true, value: 100 })
    expect(checkGoal("churnLimit", "4.5%")).toEqual({ ok: true, value: 4.5 })
    expect(checkGoal("churnLimit", "4.56")).toEqual({ ok: true, value: 4.6 })
  })

  it("rejects percentages out of range or not numbers", () => {
    expect(checkGoal("trialToPaid", "101")).toMatchObject({ ok: false, error: expect.stringMatching(/100/) })
    for (const raw of ["-1", "ten", "5%%", "."]) {
      expect(checkGoal("churnLimit", raw).ok, raw).toBe(false)
    }
  })

  it("treats blank as not set", () => {
    expect(checkGoal("monthlyRevenue", "  ")).toEqual({ ok: true, value: null })
  })
})

describe("checkGoals", () => {
  it("returns every error at once and no goals when any field is invalid", () => {
    const result = checkGoals({ monthlyRevenue: "abc", trialToPaid: "20", churnLimit: "150" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["churnLimit", "monthlyRevenue"])
  })

  it("round-trips through the draft text", () => {
    const result = checkGoals({ monthlyRevenue: "$30,000", trialToPaid: "18", churnLimit: "" })
    expect(result).toEqual({ ok: true, goals: { monthlyRevenue: 30000, trialToPaid: 18, churnLimit: null } })
    if (result.ok) expect(goalDraft(result.goals)).toEqual({ monthlyRevenue: "30000", trialToPaid: "18", churnLimit: "" })
  })

  it("formats for display", () => {
    expect(formatGoal("monthlyRevenue", 30000)).toBe("$30,000")
    expect(formatGoal("churnLimit", 4.5)).toBe("4.5%")
    expect(formatGoal("trialToPaid", null)).toBe("Not set")
  })
})

describe("sidebar order and visibility", () => {
  it("moves a screen up and down, and is a no-op at the ends", () => {
    const up = moveScreen(defaultSidebar(), "/metrics", -1)
    expect(up.order.slice(0, 3)).toEqual(["/home", "/metrics", "/my-desk"])
    const down = moveScreen(up, "/metrics", 1)
    expect(down.order).toEqual(screens)
    expect(moveScreen(defaultSidebar(), "/home", -1).order).toEqual(screens)
    expect(moveScreen(defaultSidebar(), screens.at(-1)!, 1).order).toEqual(screens)
  })

  it("hides and shows screens, but never Home", () => {
    const hidden = setScreenHidden(defaultSidebar(), "/bugs", true)
    expect(hidden.hidden).toEqual(["/bugs"])
    expect(setScreenHidden(hidden, "/bugs", false).hidden).toEqual([])
    expect(setScreenHidden(defaultSidebar(), HOME_HREF, true).hidden).toEqual([])
  })

  it("renders visible screens in order, then external links", () => {
    let prefs = setScreenHidden(defaultSidebar(), "/infrastructure", true)
    prefs = moveScreen(prefs, "/crm", -1)
    const hrefs = visibleNavItems(prefs).map((i) => i.href)
    expect(hrefs).not.toContain("/infrastructure")
    expect(hrefs.indexOf("/crm")).toBeLessThan(hrefs.indexOf("/sales-opportunities"))
    expect(hrefs.at(-1)).toBe("https://chlkapp.com")
    expect(hrefs).toHaveLength(navItems.length - 1)
  })

  it("lists every screen with its hidden flag", () => {
    const rows = sidebarRows(setScreenHidden(defaultSidebar(), "/clinics", true))
    expect(rows).toHaveLength(screens.length)
    expect(rows.find((r) => r.item.href === "/clinics")?.hidden).toBe(true)
  })

  it("normalizes a stale order: unknown dropped, duplicates collapsed, new screens slotted in", () => {
    const stale = ["/metrics", "/gone", "/home", "/metrics"]
    const order = normalizeOrder(stale)
    expect(order[0]).toBe("/metrics")
    expect(order.indexOf("/metrics")).toBeLessThan(order.indexOf("/home"))
    expect([...order].sort()).toEqual([...screens].sort())
    // Missing screens follow their default neighbour: My Desk after Home,
    // Agent Workplace after Metrics.
    expect(order[order.indexOf("/home") + 1]).toBe("/my-desk")
    expect(order[order.indexOf("/metrics") + 1]).toBe("/agent-workplace")
  })

  it("drops Home and unknown hrefs from hidden", () => {
    expect(normalizeSidebar({ order: screens, hidden: ["/home", "/nope", "/bugs", "/bugs"] }).hidden).toEqual(["/bugs"])
  })

  it("knows when it is at the default", () => {
    expect(isDefaultSidebar(defaultSidebar())).toBe(true)
    expect(isDefaultSidebar(moveScreen(defaultSidebar(), "/crm", -1))).toBe(false)
    expect(isDefaultSidebar(setScreenHidden(defaultSidebar(), "/crm", true))).toBe(false)
  })
})

describe("parseSettings", () => {
  const valid: Settings = {
    timeZone: "America/New_York",
    goals: { monthlyRevenue: 20000, trialToPaid: 15, churnLimit: null },
    sidebar: { order: screens, hidden: ["/bugs"] },
  }

  it("accepts a valid copy", () => {
    expect(parseSettings(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
  })

  it("rejects malformed copies outright", () => {
    const bad: unknown[] = [
      null,
      "x",
      [],
      { ...valid, timeZone: "Mars/Olympus" },
      { ...valid, goals: { ...valid.goals, monthlyRevenue: -1 } },
      { ...valid, goals: { ...valid.goals, churnLimit: 140 } },
      { ...valid, goals: { monthlyRevenue: 1 } },
      { ...valid, sidebar: { order: "nope", hidden: [] } },
      { ...valid, sidebar: undefined },
    ]
    for (const value of bad) expect(parseSettings(value), JSON.stringify(value)).toBeNull()
  })

  it("reads past the dropped sampleData field in an older copy (it goes on the next save)", () => {
    for (const sampleData of [false, true, "yes"]) {
      expect(parseSettings({ ...valid, sampleData })).toEqual(valid)
    }
  })

  it("normalizes the sidebar rather than rejecting it", () => {
    const parsed = parseSettings({ ...valid, sidebar: { order: ["/bugs", "/old", "/home"], hidden: ["/home"] } })
    expect(parsed?.sidebar.order[0]).toBe("/bugs")
    expect(parsed?.sidebar.order).toHaveLength(screens.length)
    expect(parsed?.sidebar.hidden).toEqual([])
  })
})

describe("settingsStorage", () => {
  it("round-trips through localStorage under the versioned key", () => {
    const next = { ...DEFAULT_SETTINGS, timeZone: "UTC" as const }
    expect(settingsStorage.save(window.localStorage, next)).toBe(true)
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify(next))
    expect(settingsStorage.load(window.localStorage)).toEqual({ state: next, status: "saved" })
  })

  it("is SSR safe and tolerates corrupt copies", () => {
    expect(settingsStorage.load(undefined)).toEqual({ state: null, status: "empty" })
    window.localStorage.setItem(SETTINGS_KEY, "{not json")
    expect(settingsStorage.load(window.localStorage)).toMatchObject({ state: null, status: "rejected" })
    // The first real save parks the bad copy and replaces it.
    expect(settingsStorage.save(window.localStorage, DEFAULT_SETTINGS)).toBe(true)
    expect(settingsStorage.rejected(window.localStorage)[0]?.raw).toBe("{not json")
  })

  it("reports a failed save", () => {
    expect(settingsStorage.save(quotaExceededStorage(), DEFAULT_SETTINGS)).toBe(false)
  })
})
