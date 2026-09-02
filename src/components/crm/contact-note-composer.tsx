"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PhoneIcon, StickyNoteIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Kind = "user" | "call"

/** The browser's datetime-local format, in local time: "2026-09-02T14:30". */
function localDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Write a note about a person, or log a call with them. A call carries the
 * time it happened, defaulting to now, so one logged the next morning
 * still sorts where it belongs.
 */
export function ContactNoteComposer({ contactId }: { contactId: string }) {
  const router = useRouter()
  const [kind, setKind] = React.useState<Kind>("user")
  const [body, setBody] = React.useState("")
  const [at, setAt] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  function changeKind(next: Kind) {
    setKind(next)
    // The date field appears with the call, filled in with the moment you
    // switched to it; it is only rendered on the client, after a click.
    if (next === "call") setAt(localDateTimeValue(new Date()))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!body.trim()) return
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/crm/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          kind,
          at: kind === "call" && at ? at : undefined,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed.")
      setBody("")
      toast.success(kind === "call" ? "Call logged." : "Note added.")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add the note."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={[kind]}
          onValueChange={(values) => {
            const next = values[0]
            if (next === "user" || next === "call") changeKind(next)
          }}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="What to add"
        >
          <ToggleGroupItem value="user">
            <StickyNoteIcon />
            Note
          </ToggleGroupItem>
          <ToggleGroupItem value="call">
            <PhoneIcon />
            Call
          </ToggleGroupItem>
        </ToggleGroup>
        {kind === "call" ? (
          <Label className="text-muted-foreground flex items-center gap-2 text-xs">
            When
            <Input
              type="datetime-local"
              value={at}
              max={localDateTimeValue(new Date())}
              onChange={(event) => setAt(event.target.value)}
              className="h-7 w-auto text-xs"
              required
            />
          </Label>
        ) : null}
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          kind === "call"
            ? "What did you talk about?"
            : "Something worth remembering about them… (only you see these)"
        }
        rows={3}
        required
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSubmitting || !body.trim()}>
          {isSubmitting ? "Saving…" : kind === "call" ? "Log call" : "Add note"}
        </Button>
      </div>
    </form>
  )
}
