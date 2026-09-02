"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { HourglassIcon, ReplyIcon, SearchIcon } from "lucide-react"

import { useListUrl } from "@/components/crm/use-list-url"
import { Button } from "@/components/ui/button"
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

const WINDOW_ITEMS = [
  { value: "all", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
]

const AUDIENCE_ITEMS = [
  { value: "all", label: "Everyone" },
  { value: "customer", label: "Customers" },
  { value: "unknown", label: "Not a customer" },
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
  const searchParams = useSearchParams()
  const status = searchParams.get("status") ?? ""
  const priority = searchParams.get("priority") ?? "all"
  const window = searchParams.get("window") ?? "all"
  const audience = searchParams.get("audience") ?? "all"
  const needsReply = searchParams.get("needsReply") === "1"
  const overdue = searchParams.get("overdue") === "1"
  const [q, setQ] = React.useState(searchParams.get("q") ?? "")

  const buildUrl = useListUrl()

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
      <Button
        variant={needsReply ? "default" : "outline"}
        size="sm"
        aria-pressed={needsReply}
        onClick={() =>
          router.replace(buildUrl({ needsReply: needsReply ? "" : "1" }))
        }
      >
        <ReplyIcon />
        Needs my reply
      </Button>
      <Button
        variant={overdue ? "default" : "outline"}
        size="sm"
        aria-pressed={overdue}
        title="Waiting on your reply for over three days"
        onClick={() => router.replace(buildUrl({ overdue: overdue ? "" : "1" }))}
      >
        <HourglassIcon />
        Overdue
      </Button>
      <Select
        items={WINDOW_ITEMS}
        value={window}
        onValueChange={(value) =>
          router.replace(
            buildUrl({ window: value === "all" ? "" : String(value) })
          )
        }
      >
        <SelectTrigger size="sm" aria-label="Date filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={AUDIENCE_ITEMS}
        value={audience}
        onValueChange={(value) =>
          router.replace(
            buildUrl({ audience: value === "all" ? "" : String(value) })
          )
        }
      >
        <SelectTrigger size="sm" aria-label="Customer filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIENCE_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
