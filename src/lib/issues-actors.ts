import type { Actor } from "@/lib/issues"

export const RASHAD = "rashad"
export const MAY = "may"
/** Owns the Bugs page (founder-dashboard-screens.md: "Bugs — Yo-Yo's page"). */
export const YOYO = "yoyo"

/**
 * Roster. Humans are the people who touch this board (Yo-Yo owns Bugs);
 * agents use the placeholder names from the requirements doc — do not swap
 * in real ones. This is who a ticket can be assigned to, not data rows, so
 * it ships; the old demo board lives only in `@/lib/issues-fixture` (tests).
 */
export const actors: Actor[] = [
  { id: RASHAD, name: "Rashad", kind: "human", initials: "RB", tone: "brand" },
  { id: MAY, name: "May", kind: "human", initials: "MW", tone: "neutral" },
  { id: YOYO, name: "Yo-Yo", kind: "human", initials: "YY", tone: "neutral" },
  { id: "grok-1", name: "Grok-1", kind: "agent", initials: "G1" },
  { id: "grok-2", name: "Grok-2", kind: "agent", initials: "G2" },
  { id: "grok-3", name: "Grok-3", kind: "agent", initials: "G3" },
]
