"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { MessageSquareIcon } from "lucide-react"

import { useListUrl } from "@/components/crm/use-list-url"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const COACH_ITEMS = [
  { value: "all", label: "Any size" },
  { value: "2", label: "2+ coaches" },
  { value: "5", label: "5+ coaches" },
  { value: "10", label: "10+ coaches" },
]

const FILTER_KEYS = ["plan", "coaches", "open"]

/** The filters under the Accounts chips; all state lives in the URL. */
export function AccountsFilterBar({ plans }: { plans: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const buildUrl = useListUrl()
  const plan = searchParams.get("plan") ?? "all"
  const coaches = searchParams.get("coaches") ?? "all"
  const hasOpenCase = searchParams.get("open") === "1"
  const anyActive = FILTER_KEYS.some((key) => searchParams.has(key))

  const planItems = [
    { value: "all", label: "Any plan" },
    ...plans.map((label) => ({ value: label, label })),
  ]
  if (plan !== "all" && !plans.includes(plan)) {
    planItems.push({ value: plan, label: plan })
  }
  const coachItems = COACH_ITEMS.some((item) => item.value === coaches)
    ? COACH_ITEMS
    : [...COACH_ITEMS, { value: coaches, label: `${coaches}+ coaches` }]

  function go(updates: Record<string, string>) {
    router.replace(buildUrl(updates))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={planItems}
        value={plan}
        onValueChange={(value) =>
          go({ plan: value === "all" ? "" : String(value) })
        }
      >
        <SelectTrigger size="sm" aria-label="Plan filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {planItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={coachItems}
        value={coaches}
        onValueChange={(value) =>
          go({ coaches: value === "all" ? "" : String(value) })
        }
      >
        <SelectTrigger size="sm" aria-label="Size filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {coachItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={hasOpenCase ? "default" : "outline"}
        size="sm"
        aria-pressed={hasOpenCase}
        onClick={() => go({ open: hasOpenCase ? "" : "1" })}
      >
        <MessageSquareIcon />
        Has open case
      </Button>
      {anyActive ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            go(Object.fromEntries(FILTER_KEYS.map((key) => [key, ""])))
          }
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
