"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2Icon,
  InboxIcon,
  LayoutDashboardIcon,
  LockIcon,
  SearchIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"

import { countTriagePending } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { useCrmView } from "@/hooks/use-crm-summary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PersistenceNote } from "@/components/persistence-note"
import { CommandPalette } from "@/components/crm/command-palette"
import { CrmSourceBadge, GMAIL_READ_ONLY_NOTE } from "@/components/crm/crm-source-badge"
import { useCrm } from "@/components/crm/crm-store"
import { CRM_RESET } from "@/components/crm/crm-touch"

export const LEDE = "Conversations, contacts, and triage — from the support inbox once Gmail is connected"
/** While Gmail's first sync runs. */
export const CONNECTING_LEDE = "Conversations, contacts, and triage"

export function liveLede(mailbox: string) {
  return `Conversations, contacts, and triage from ${mailbox}`
}

/** The screens rebuilt on `useCrmData` (Overview, Cases, Accounts). */
export function isRebuiltScreen(pathname: string) {
  return pathname === "/crm" || pathname.startsWith("/crm/cases") || pathname.startsWith("/crm/accounts")
}

const TABS = [
  { href: "/crm", label: "Overview", icon: LayoutDashboardIcon, match: (path: string) => path === "/crm" },
  { href: "/crm/cases", label: "Cases", icon: InboxIcon, match: (path: string) => path.startsWith("/crm/cases") },
  {
    href: "/crm/accounts",
    label: "Accounts",
    icon: Building2Icon,
    match: (path: string) => path.startsWith("/crm/accounts"),
  },
  {
    href: "/crm/contacts",
    label: "Contacts",
    icon: UsersIcon,
    match: (path: string) => path.startsWith("/crm/contacts"),
  },
  {
    href: "/crm/triage",
    label: "Triage",
    icon: TriangleAlertIcon,
    match: (path: string) => path.startsWith("/crm/triage"),
  },
] as const

/** How far from an edge before its fade shows (sub-pixel scroll positions). */
const EDGE_SLACK = 2

/**
 * crm-port's line tabs (real routes, so every view is a link). On a phone
 * they scroll sideways inside their own strip, never the page, with an
 * edge fade on whichever side has more (as the workplace tabs, #62); the
 * active tab is kept in view. 44 tall below 1280.
 */
function CrmTabs({ pathname, triageCount }: { pathname: string; triageCount: number }) {
  const box = React.useRef<HTMLDivElement>(null)
  const strip = React.useRef<HTMLElement>(null)

  // The fades follow the DOM's scroll position, so they live in data attributes.
  const measure = React.useCallback(() => {
    const el = strip.current
    if (!el || !box.current) return
    const max = el.scrollWidth - el.clientWidth
    box.current.toggleAttribute("data-fade-start", el.scrollLeft > EDGE_SLACK)
    box.current.toggleAttribute("data-fade-end", max - el.scrollLeft > EDGE_SLACK)
  }, [])

  React.useLayoutEffect(() => {
    const el = strip.current
    const active = el?.querySelector<HTMLElement>("[aria-current='page']")
    if (el && active) {
      const left = active.offsetLeft - el.offsetLeft
      const right = left + active.offsetWidth
      if (left - 32 < el.scrollLeft) el.scrollLeft = Math.max(0, left - 32)
      else if (right + 32 > el.scrollLeft + el.clientWidth) el.scrollLeft = right + 32 - el.clientWidth
    }
    measure()
  }, [pathname, measure])

  React.useEffect(() => {
    const el = strip.current
    if (!el) return
    el.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [measure])

  return (
    <div ref={box} className="group/tabbar relative min-w-0" data-testid="crm-tab-bar">
      <nav
        ref={strip}
        aria-label="CRM sections"
        className="flex w-full min-w-0 items-center gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-body -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 whitespace-nowrap transition-colors max-xl:min-h-11 max-xl:min-w-11 max-xl:px-3",
                active
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              <Icon aria-hidden className="size-4" />
              {tab.label}
              {tab.label === "Triage" && triageCount > 0 ? (
                <span className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 rounded-full px-1.5 text-[0.65rem] font-semibold tabular-nums">
                  {triageCount}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
      <span
        aria-hidden
        data-testid="crm-tab-fade-start"
        className="from-background pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent opacity-0 transition-opacity group-data-[fade-start]/tabbar:opacity-100"
      />
      <span
        aria-hidden
        data-testid="crm-tab-fade-end"
        className="from-background pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent opacity-0 transition-opacity group-data-[fade-end]/tabbar:opacity-100"
      />
    </div>
  )
}

export function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const store = useCrm()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const triageCount = countTriagePending(store.messages)
  const { gmail } = store
  // Connecting: the rows are skeletons, so nothing about saved edits shows
  // (no saved-edits note, Clear my entries or triage count).
  const connecting = gmail.kind === "loading" && Boolean(gmail.connecting)
  // Overview, Cases and Accounts keep status and priority edits in this
  // browser and say so themselves, so the read-only note is for the others.
  const rebuilt = isRebuiltScreen(pathname)
  // The login gate's 401: the data is behind the login, not disconnected.
  const unauthorized = useCrmView().phase === "unauthorized"

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      {/* Phone (Deke 8:2): title with a 44×44 icon-only Search top-right, the
          lede, then the note, Clear my entries and badge on their own line. */}
      <header className="flex flex-wrap items-start justify-between gap-4 max-md:justify-start max-md:gap-x-2.5">
        <div className="min-w-0 max-md:w-[calc(100%-3.375rem)] md:max-xl:min-w-52 md:max-xl:flex-1 md:max-xl:basis-0">
          <h1 className="text-display-sm font-semibold tracking-tight">CRM</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            {gmail.kind === "live" ? liveLede(gmail.mailbox) : connecting ? CONNECTING_LEDE : LEDE}
          </p>
        </div>
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2.5 max-md:contents">
          {gmail.kind === "live" ? (
            rebuilt ? null : (
              <span data-testid="crm-read-only" className="text-micro text-muted-foreground max-md:order-3">
                {GMAIL_READ_ONLY_NOTE}
              </span>
            )
          ) : connecting || unauthorized ? null : (
            <PersistenceNote store={store} mode="clear" className="max-md:order-3" resetClassName={CRM_RESET} />
          )}
          {unauthorized ? (
            <Badge
              variant="outline"
              data-testid="crm-source"
              data-source="unauthorized"
              className="text-muted-foreground! h-6 px-2 max-md:order-4 max-md:self-center"
            >
              <LockIcon aria-hidden />
              Session expired
            </Badge>
          ) : (
            <CrmSourceBadge feed={gmail} className="max-md:order-4 max-md:self-center" />
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3.5 max-xl:h-11! max-md:order-2 max-md:size-11! max-md:px-0!"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon aria-hidden />
            <span className="max-md:sr-only">Search</span>
            <kbd className="text-micro text-muted-foreground ml-1 rounded border px-1 font-medium max-md:hidden">
              ⌘K
            </kbd>
          </Button>
        </div>
      </header>

      <CrmTabs pathname={pathname} triageCount={connecting ? 0 : triageCount} />

      {children}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
