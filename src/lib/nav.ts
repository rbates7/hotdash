import {
  ActivityIcon,
  BotIcon,
  BugIcon,
  ChartColumnIcon,
  ExternalLinkIcon,
  HeartHandshakeIcon,
  HomeIcon,
  LightbulbIcon,
  MapIcon,
  NotebookPenIcon,
  PresentationIcon,
  ServerIcon,
  TargetIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /** Opens in a new tab and never participates in active-state matching. */
  external?: boolean
}

/**
 * Single source of truth for sidebar order, labels, routes and icons.
 * Every entry except the external one has a matching route under `src/app`.
 */
export const navItems: NavItem[] = [
  { label: "Home", href: "/home", icon: HomeIcon },
  { label: "My Desk", href: "/my-desk", icon: NotebookPenIcon },
  { label: "Metrics", href: "/metrics", icon: ChartColumnIcon },
  { label: "Agent Workplace", href: "/agent-workplace", icon: BotIcon },
  { label: "Feature Request", href: "/feature-request", icon: LightbulbIcon },
  { label: "Product Roadmap", href: "/product-roadmap", icon: MapIcon },
  { label: "Sales Opportunities", href: "/sales-opportunities", icon: TargetIcon },
  { label: "CRM", href: "/crm", icon: UsersIcon },
  { label: "Clinics", href: "/clinics", icon: PresentationIcon },
  {
    label: "Community Development",
    href: "/community-development",
    icon: HeartHandshakeIcon,
  },
  { label: "System Status", href: "/system-status", icon: ActivityIcon },
  { label: "Bugs", href: "/bugs", icon: BugIcon },
  { label: "Infrastructure", href: "/infrastructure", icon: ServerIcon },
  {
    label: "chlkapp.com",
    href: "https://chlkapp.com",
    icon: ExternalLinkIcon,
    external: true,
  },
]

/** True when `pathname` is `href` or a descendant of it. */
export function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
