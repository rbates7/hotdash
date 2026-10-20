"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2Icon,
  ContactRoundIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { countTriagePending } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { useCrmView } from "@/hooks/use-crm-summary"
import { Button } from "@/components/ui/button"
import { CommandPalette } from "@/components/crm/command-palette"
import { CrmHeaderMenu } from "@/components/crm/crm-header-menu"
import { useCrm } from "@/components/crm/crm-store"

export const FIND_CONTACT = "Find a contact…"

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
    href: "/crm/triage",
    label: "Triage",
    icon: TriangleAlertIcon,
    match: (path: string) => path.startsWith("/crm/triage"),
  },
  {
    href: "/crm/contacts",
    label: "Contacts",
    icon: ContactRoundIcon,
    match: (path: string) => path.startsWith("/crm/contacts"),
  },
] as const

/** How far from an edge before its fade shows (sub-pixel scroll positions). */
const EDGE_SLACK = 2

/**
 * The section tabs, exactly Overview · Cases · Accounts · Triage (count) ·
 * Contacts (Deke's spec, per Simmons): the current segmented pill look
 * (muted track, active `surface` + shadow-sm), each with its Sept icon, as
 * real routes so every view is a link. On a phone they scroll sideways
 * inside their own strip, never the page, with an edge fade on whichever
 * side has more (as the workplace tabs, #62); the active tab is kept in
 * view. 44 tall below 1280.
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
    <div ref={box} className="group/tabbar relative max-w-full min-w-0 self-start" data-testid="crm-tab-bar">
      <nav
        ref={strip}
        aria-label="CRM sections"
        className="bg-muted flex w-fit max-w-full min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "text-body flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 whitespace-nowrap transition-colors max-xl:h-11 max-xl:min-w-11 max-xl:px-3",
                active
                  ? "bg-surface text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon aria-hidden className="size-4" />
              {tab.label}
              {tab.label === "Triage" && triageCount > 0 ? (
                <span className="text-warning-text rounded-[6px] bg-[color-mix(in_srgb,var(--warning)_18%,var(--surface))] px-1.5 text-[0.65rem] font-semibold tabular-nums">
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
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* Deke's header: the title and lede; on the right "Find a contact…"
          (⌘K) and the ⋯ menu, which holds Gmail's state and where edits
          live. Phone: title and ⋯ on one row, the full-width finder below. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-display-sm font-semibold tracking-tight">CRM</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            {gmail.kind === "live" ? liveLede(gmail.mailbox) : connecting ? CONNECTING_LEDE : LEDE}
          </p>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            className="text-muted-foreground h-9 w-72 justify-start gap-2 px-3 font-normal max-xl:h-11! max-md:hidden"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon aria-hidden />
            <span className="flex-1 text-left">{FIND_CONTACT}</span>
            <kbd className="text-micro rounded border px-1 font-medium">⌘K</kbd>
          </Button>
          <CrmHeaderMenu store={store} unauthorized={unauthorized} rebuilt={rebuilt} />
        </div>
        <Button
          variant="outline"
          className="text-muted-foreground h-11 w-full justify-start gap-2 px-3 font-normal md:hidden"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon aria-hidden />
          {FIND_CONTACT}
        </Button>
      </header>

      <CrmTabs pathname={pathname} triageCount={connecting ? 0 : triageCount} />

      {children}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
