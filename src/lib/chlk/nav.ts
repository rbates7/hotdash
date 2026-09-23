export type CoachNavItem = {
  label: string
  href: string
  /** Other paths that should light this item up (e.g. `/recents` for `/`). */
  aliases?: string[]
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
    aliases: ["/recents"],
    icon: "/chlk/clock-ring.svg",
    iconSize: { width: 9, height: 9 },
  },
  {
    label: "Playbook Library",
    href: "/playbook-library",
    icon: "/chlk/playbook.svg",
    iconSize: { width: 11, height: 9 },
  },
  {
    label: "Tutorials",
    href: "/tutorials",
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

export function isActiveCoachRoute(pathname: string, item: CoachNavItem) {
  const matches = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
  return matches(item.href) || (item.aliases ?? []).some(matches)
}
