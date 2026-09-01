"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "closed", label: "Closed" },
]

const PRIORITY_ITEMS = [
  { value: "all", label: "Any priority" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

export function CasesFilterBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const status = searchParams.get("status") ?? ""
  const priority = searchParams.get("priority") ?? "all"
  const [q, setQ] = React.useState(searchParams.get("q") ?? "")

  const buildUrl = React.useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams]
  )

  React.useEffect(() => {
    const current = searchParams.get("q") ?? ""
    if (q === current) return
    const timeout = setTimeout(() => {
      router.replace(buildUrl({ q }))
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, router, buildUrl, searchParams])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={buildUrl({ status: tab.value })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              status === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Select
        items={PRIORITY_ITEMS}
        value={priority}
        onValueChange={(value) =>
          router.replace(
            buildUrl({ priority: value === "all" ? "" : String(value) })
          )
        }
      >
        <SelectTrigger size="sm" aria-label="Priority filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative ml-auto">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search cases…"
          className="h-8 w-56 pl-9!"
        />
      </div>
    </div>
  )
}
