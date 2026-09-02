"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { formatDate } from "@/lib/crm/format"

/**
 * The tick beside each name on the Overview's new and churned lists: "I
 * have reached out to this person." Mail you sent them after the event
 * fills it in by itself, dated and locked — the mail exists. Otherwise it
 * is yours to tick for a call or a text: ticking records when, unticking
 * forgets, and the box flips at once, coming back only if the save failed.
 */
export function ReachedOutCheckbox({
  contactId,
  name,
  reachedOutAt,
  contactedAt = null,
  contactedVia = null,
}: {
  contactId: string
  name: string
  /** ISO timestamp, or null. A string so the server can hand it over. */
  reachedOutAt: string | null
  /** When you last emailed or called them after the event, ISO, or null. */
  contactedAt?: string | null
  contactedVia?: "email" | "call" | null
}) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()
  // Optimistic: the box shows the click at once and falls back to what the
  // server knows if the save fails or once the refreshed page arrives.
  const [checked, setChecked] = React.useOptimistic(reachedOutAt !== null)

  function handleChange(next: boolean) {
    startTransition(async () => {
      setChecked(next)
      try {
        const response = await fetch(`/api/crm/contacts/${contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reachedOut: next }),
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? "Could not save that.")
        }
        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save that."
        )
      }
    })
  }

  if (contactedAt) {
    const when = new Date(contactedAt)
    const verb = contactedVia === "call" ? "called" : "emailed"
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={`You ${verb} them ${when.toLocaleString()}`}
      >
        <span className="text-muted-foreground text-xs">
          {contactedVia === "call" ? "Called" : "Emailed"} {formatDate(when)}
        </span>
        <Checkbox checked disabled aria-label={`You ${verb} ${name}`} />
      </span>
    )
  }

  const when = reachedOutAt ? new Date(reachedOutAt) : null
  return (
    <span
      className="inline-flex"
      title={
        checked && when
          ? `Reached out ${when.toLocaleString()}`
          : "Tick once you have reached out"
      }
    >
      <Checkbox
        checked={checked}
        onCheckedChange={handleChange}
        aria-label={`Reached out to ${name}`}
      />
    </span>
  )
}
