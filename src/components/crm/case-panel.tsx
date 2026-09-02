"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Maximize2Icon,
  XIcon,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  )
}

/**
 * The frame around a case opened beside the Cases list: previous and next
 * step through the list in its current order, Esc closes, and the case can
 * be popped out to its own page. j / k work like they do in Gmail.
 */
export function CasePanel({
  prevHref,
  nextHref,
  closeHref,
  fullHref,
  position,
  children,
}: {
  prevHref: string | null
  nextHref: string | null
  closeHref: string
  fullHref: string
  /** "3 of 50", or null when the open case is not on this page of the list. */
  position: string | null
  children: React.ReactNode
}) {
  const router = useRouter()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      if (event.key === "j" && nextHref) {
        event.preventDefault()
        router.push(nextHref, { scroll: false })
      } else if (event.key === "k" && prevHref) {
        event.preventDefault()
        router.push(prevHref, { scroll: false })
      } else if (event.key === "Escape") {
        router.push(closeHref, { scroll: false })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router, nextHref, prevHref, closeHref])

  return (
    <aside
      aria-label="Open case"
      className="bg-card flex min-w-0 flex-col rounded-xl border lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!prevHref}
          onClick={() => prevHref && router.push(prevHref, { scroll: false })}
          aria-label="Previous case"
          title="Previous case (k)"
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!nextHref}
          onClick={() => nextHref && router.push(nextHref, { scroll: false })}
          aria-label="Next case"
          title="Next case (j)"
        >
          <ChevronDownIcon />
        </Button>
        {position ? (
          <span className="text-muted-foreground ml-1 text-xs tabular-nums">
            {position}
          </span>
        ) : null}
        <span className="flex-1" />
        <Link
          href={fullHref}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          title="Open as its own page"
        >
          <Maximize2Icon />
          Full page
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push(closeHref, { scroll: false })}
          aria-label="Close"
          title="Close (Esc)"
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  )
}
