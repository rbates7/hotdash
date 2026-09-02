"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { MessageSquareIcon, XIcon } from "lucide-react"

import { useListUrl } from "@/components/crm/use-list-url"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CUSTOMER_PLAN_STATUSES,
  PLAN_STATUS_LABELS,
} from "@/lib/crm/contacts/plan-status"

const STATUS_ITEMS = [
  { value: "all", label: "Any status" },
  ...CUSTOMER_PLAN_STATUSES.map((status) => ({
    value: status,
    label: PLAN_STATUS_LABELS[status],
  })),
]

const STARTED_ITEMS = [
  { value: "all", label: "Started any time" },
  { value: "7d", label: "Started in last 7 days" },
  { value: "30d", label: "Started in last 30 days" },
  { value: "90d", label: "Started in last 90 days" },
]

const ENDED_ITEMS = [
  { value: "all", label: "Ended any time" },
  { value: "7d", label: "Ended in last 7 days" },
  { value: "30d", label: "Ended in last 30 days" },
  { value: "90d", label: "Ended in last 90 days" },
]

const FILTER_KEYS = ["plan", "status", "started", "ended", "open", "affiliation"]

/**
 * The second row of controls on Customers. Everything lives in the URL, so
 * a filtered view is a link. Two of these quietly widen the view: churned
 * people are hidden by the default Active view, so asking for them (status
 * Canceled, or an end date) flips to Everyone rather than showing nothing.
 */
export function CustomersFilterBar({ plans }: { plans: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const buildUrl = useListUrl()
  const plan = searchParams.get("plan") ?? "all"
  const status = searchParams.get("status") ?? "all"
  const started = searchParams.get("started") ?? "all"
  const ended = searchParams.get("ended") ?? "all"
  const hasOpenCase = searchParams.get("open") === "1"
  const affiliation = searchParams.get("affiliation")
  const anyActive = FILTER_KEYS.some((key) => searchParams.has(key))

  const planItems = [
    { value: "all", label: "Any plan" },
    ...plans.map((label) => ({ value: label, label })),
  ]
  // A plan that is in the URL but no longer in the book: keep it in the
  // menu so the trigger does not render blank.
  if (plan !== "all" && !plans.includes(plan)) {
    planItems.push({ value: plan, label: plan })
  }

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
        items={STATUS_ITEMS}
        value={status}
        onValueChange={(value) =>
          go({
            status: value === "all" ? "" : String(value),
            ...(value === "canceled" ? { standing: "all" } : {}),
          })
        }
      >
        <SelectTrigger size="sm" aria-label="Status filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={STARTED_ITEMS}
        value={started}
        onValueChange={(value) =>
          go({ started: value === "all" ? "" : String(value) })
        }
      >
        <SelectTrigger size="sm" aria-label="Start date filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STARTED_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={ENDED_ITEMS}
        value={ended}
        onValueChange={(value) =>
          go({
            ended: value === "all" ? "" : String(value),
            ...(value === "all" ? {} : { standing: "all" }),
          })
        }
      >
        <SelectTrigger size="sm" aria-label="End date filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ENDED_ITEMS.map((item) => (
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
      {affiliation ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => go({ affiliation: "" })}
          aria-label={`Stop filtering by school ${affiliation}`}
        >
          School: {affiliation}
          <XIcon />
        </Button>
      ) : null}
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
