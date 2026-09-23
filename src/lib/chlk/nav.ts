export type CoachNavItem = {
  label: string
  /**
   * Route for this item. Omitted when the feature is listed in the sidebar
   * but has no frame in the handoff (Tutorials) — the item renders inert.
   */
  href?: string
  /** Static icon exported from the Figma file, served from /public/chlk. */
  icon: string
  /** Intrinsic icon size in px, as drawn in Figma (never stretched). */
  iconSize: { width: number; height: number }
}

/**
 * Coach sidebar — only features that are live in Chlk today. Anything marked
 * "coming soon" in the Figma (Templates) is intentionally left out.
 */
export const coachNavItems: CoachNavItem[] = [
  {
    label: "Recents",
    href: "/",
    icon: "/chlk/clock-ring.svg",
    iconSize: { width: 9, height: 9 },
  },
  {
    label: "Playbook Library",
    href: "/playbook",
    icon: "/chlk/playbook.svg",
    iconSize: { width: 11, height: 9 },
  },
  {
    label: "Tutorials",
    icon: "/chlk/tutorials.svg",
    iconSize: { width: 11, height: 9 },
  },
  {
    label: "One Play a Day",
    href: "/one-play-a-day",
    icon: "/chlk/one-play.svg",
    iconSize: { width: 12, height: 12 },
  },
]

export function isActiveCoachRoute(pathname: string, href: string | undefined) {
  if (!href) return false
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
