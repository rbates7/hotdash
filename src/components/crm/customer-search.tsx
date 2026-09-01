"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type CustomerHit = {
  id: string
  name: string
  email: string
  organization: string | null
}

/**
 * Always-visible customer lookup in the CRM header. Searches the same
 * endpoint as the ⌘K palette but only surfaces people, since "find this
 * customer" is the most common way into the CRM.
 */
export function CustomerSearch() {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [hits, setHits] = React.useState<CustomerHit[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const [highlighted, setHighlighted] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!query.trim()) return
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/crm/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )
        if (!response.ok) return
        const payload = (await response.json()) as { contacts: CustomerHit[] }
        setHits(payload.contacts)
        setHighlighted(0)
        setIsOpen(true)
      } catch {
        // Aborted or transient — the next keystroke retries.
      }
    }, 150)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [query])

  // Clicking anywhere else dismisses the results.
  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  function go(id: string) {
    setIsOpen(false)
    setQuery("")
    setHits([])
    router.push(`/crm/customers/${id}`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!isOpen || hits.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted((i) => (i + 1) % hits.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted((i) => (i - 1 + hits.length) % hits.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const hit = hits[highlighted]
      if (hit) go(hit.id)
    } else if (event.key === "Escape") {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <SearchIcon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => {
          const value = event.target.value
          setQuery(value)
          if (!value.trim()) {
            setHits([])
            setIsOpen(false)
          }
        }}
        onFocus={() => hits.length > 0 && setIsOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Find a customer…"
        aria-label="Find a customer"
        className="h-8 pl-9!"
      />
      {isOpen ? (
        <div className="bg-popover absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border shadow-md">
          {hits.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2.5 text-sm">
              No customers match “{query}”.
            </p>
          ) : (
            hits.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => go(hit.id)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                  index === highlighted ? "bg-muted" : ""
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{hit.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {hit.email}
                  </span>
                </span>
                {hit.organization ? (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {hit.organization}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
