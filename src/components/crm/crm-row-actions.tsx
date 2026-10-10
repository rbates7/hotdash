"use client"

import * as React from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { CRM_DANGER_TEXT } from "@/components/crm/crm-touch"

/*
 * Row actions for the Cases and Contacts lists, the Sales pattern (Deke 7:83):
 * phone (<768) taps a RowCollapse card and gets the row menu as a bottom
 * sheet; tablet (768–1279) gets one 44×44 "…" per row. Both open the same
 * dialogs the detail pages use.
 */

/**
 * The stock Nova × (`cn-sheet-close`) as a 44×44 hit below 1280; `!` beats
 * Nova's unlayered `icon-sm` size.
 */
export const SHEET_CLOSE = "max-xl:[&>[data-slot=sheet-close]]:size-11!"

/** A 48px action row in the phone sheet. */
export const SHEET_ACTION =
  "hover:bg-muted focus-visible:ring-ring/50 flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0"

/** Phone cards: the tag keeps its own width instead of stretching across the card. */
export const CARD = "[&_[data-testid=sample-data-tag]]:self-start"

/** Phone card list: no rule under the last card (the TableCard has its own border). */
export const CARD_LIST = "[&_[role=listitem]:last-child>*]:border-b-0"

/**
 * Open a dialog only once the menu or sheet that asked for it has finished
 * closing, so their focus return cannot steal focus from the dialog.
 */
export function useDeferredAction<A extends string>() {
  const [action, setAction] = React.useState<A | null>(null)
  const queued = React.useRef<A | null>(null)
  return {
    action,
    queue: (next: A) => {
      queued.current = next
    },
    flush: () => {
      if (queued.current) setAction(queued.current)
      queued.current = null
    },
    clear: () => setAction(null),
  }
}

/**
 * Where focus goes once a record leaves the list: the item now in its place,
 * else the one before it, else the list heading.
 */
function nextInPlace(root: HTMLElement | null, selector: string, index: number) {
  if (!root) return null
  const remaining = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.getClientRects().length > 0
  )
  return (
    remaining[Math.min(index, remaining.length - 1)] ??
    root.querySelector<HTMLElement>("[data-crm-list-heading]")
  )
}

const CARD_SELECTOR = `[data-slot='${ROW_COLLAPSE_SLOT}']`
const ROW_MENU_SELECTOR = "[data-crm-row-menu]"

/**
 * The list's focus bookkeeping: which card opened the sheet (to hand focus
 * back), and where focus goes when that record is deleted.
 */
export function useListFocus() {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const lastCard = React.useRef<HTMLElement | null>(null)
  const lastCardIndex = React.useRef(0)
  const lastMenuIndex = React.useRef(0)

  return {
    rootRef,
    lastCard,
    /** On the card list: remember the card a tap came from. */
    onCardClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      const card = (event.target as Element).closest<HTMLElement>(CARD_SELECTOR)
      if (!card) return
      lastCard.current = card
      const all = Array.from(event.currentTarget.querySelectorAll(CARD_SELECTOR))
      lastCardIndex.current = Math.max(0, all.indexOf(card))
    },
    /** On the table: remember which row's "…" opened the menu. */
    onMenuClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      const trigger = (event.target as Element).closest<HTMLElement>(ROW_MENU_SELECTOR)
      if (!trigger) return
      const all = Array.from(event.currentTarget.querySelectorAll(ROW_MENU_SELECTOR))
      lastMenuIndex.current = Math.max(0, all.indexOf(trigger))
    },
    /** Sheet and its dialogs: back to the card, or the next one once it is gone. */
    backToCard: () => {
      const card = lastCard.current
      if (card?.isConnected) return card
      return nextInPlace(rootRef.current, CARD_SELECTOR, lastCardIndex.current) ?? true
    },
    /** Tablet delete: the next row's "…", else the heading. */
    afterMenuDelete: () =>
      nextInPlace(rootRef.current, ROW_MENU_SELECTOR, lastMenuIndex.current) ?? true,
  }
}

/**
 * Base UI wraps Tab at the sheet's ends through a focus guard and a
 * requestAnimationFrame, so for a frame focus sits outside the sheet. Wrap
 * synchronously instead (as Sales does).
 */
function wrapTab(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return
  const tabbable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"
    )
  ).filter((el) => el.getClientRects().length > 0)
  if (tabbable.length === 0) return
  const first = tabbable[0]
  const last = tabbable[tabbable.length - 1]
  const target = event.shiftKey
    ? document.activeElement === first && last
    : document.activeElement === last && first
  if (!target) return
  event.preventDefault()
  target.focus()
}

/**
 * Phone (<768): the record's summary and every row action as a bottom sheet,
 * titled by the record. The stock × (44px below 1280), a backdrop tap and
 * Escape close it; focus is trapped and returns to the card.
 */
export function RecordSheet({
  open,
  onOpenChange,
  onClosed,
  finalFocus,
  title,
  pill,
  lines,
  actionsLabel,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** After the close animation: open a queued dialog. */
  onClosed: () => void
  finalFocus: React.ComponentProps<typeof SheetContent>["finalFocus"]
  title: string
  pill?: React.ReactNode
  lines: string[]
  actionsLabel: string
  children: React.ReactNode
}) {
  const [description, ...rest] = lines
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
    >
      <SheetContent
        side="bottom"
        finalFocus={finalFocus}
        onKeyDown={wrapTab}
        className={cn(
          "max-h-[90dvh] gap-3 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]",
          SHEET_CLOSE
        )}
      >
        <div aria-hidden className="bg-muted-foreground/30 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />
        <SheetHeader className="gap-1 px-4 pt-0 pb-0 max-xl:pr-14">
          <div className="flex items-start gap-2">
            <SheetTitle className="text-body min-w-0 font-semibold tracking-tight">{title}</SheetTitle>
            {pill ? <span className="shrink-0">{pill}</span> : null}
          </div>
          <SheetDescription className="text-caption text-muted-foreground">{description}</SheetDescription>
          {rest.map((line) => (
            <p key={line} className="text-caption text-muted-foreground">
              {line}
            </p>
          ))}
        </SheetHeader>
        <div role="group" aria-label={actionsLabel} className="flex flex-col px-2 pb-2">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The tablet row menu's dialogs live at the screen, not in the row: deleting
 * the record removes its row, and a dialog inside it would unmount before it
 * could hand focus on. `target` stays set while the dialog closes.
 */
export function useRowDialogs<T, A extends string>() {
  const [target, setTarget] = React.useState<T | null>(null)
  const [action, setAction] = React.useState<A | null>(null)
  return {
    target,
    action,
    open: (next: T, nextAction: A) => {
      setTarget(next)
      setAction(nextAction)
    },
    close: () => setAction(null),
  }
}

export type RowMenuItem = {
  label: string
  icon: React.ReactNode
  /** Runs once the menu has finished closing, so its focus return cannot steal focus from a dialog. */
  onSelect: () => void
  destructive?: boolean
}

/** Tablet (768–1279): one 44×44 ellipsis holding the phone sheet's actions. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const picked = React.useRef<RowMenuItem | null>(null)
  return (
    <DropdownMenu
      onOpenChangeComplete={(open) => {
        if (open) return
        const item = picked.current
        picked.current = null
        item?.onSelect()
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            title="More actions"
            data-crm-row-menu=""
            className="text-muted-foreground size-11!"
          />
        }
      >
        <MoreHorizontalIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            className={cn("min-h-11", item.destructive && CRM_DANGER_TEXT)}
            variant={item.destructive ? "destructive" : "default"}
            onClick={() => {
              picked.current = item
            }}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
