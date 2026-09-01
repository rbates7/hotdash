"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDownIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

type ContactOption = {
  id: string
  email: string
  name: string
  organization: string | null
}

async function resolve(body: {
  gmailThreadId: string
  action: "promote" | "link" | "ignore"
  contactId?: string
  ignoreSenderAlways?: boolean
}) {
  const response = await fetch("/api/crm/triage/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? "Failed.")
  return payload
}

export function TriageActions({
  gmailThreadId,
  senderEmail,
  senderName,
}: {
  gmailThreadId: string
  senderEmail: string
  senderName: string | null
}) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)
  const [isLinkOpen, setIsLinkOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [options, setOptions] = React.useState<ContactOption[]>([])

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setIsBusy(true)
    try {
      await action()
      toast.success(successMessage)
      setIsLinkOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setIsBusy(false)
    }
  }

  React.useEffect(() => {
    if (!isLinkOpen) return
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/crm/contacts?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )
        if (!response.ok) return
        const payload = (await response.json()) as {
          contacts: ContactOption[]
        }
        setOptions(payload.contacts.slice(0, 8))
      } catch {
        // Aborted or transient — the next keystroke retries.
      }
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [query, isLinkOpen])

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        disabled={isBusy}
        onClick={() =>
          run(
            () => resolve({ gmailThreadId, action: "promote" }),
            `${senderName ?? senderEmail} added as a contact — case created.`
          )
        }
      >
        Promote to case
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isBusy}
        onClick={() => setIsLinkOpen(true)}
      >
        Link contact
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="More actions" />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              run(
                () => resolve({ gmailThreadId, action: "ignore" }),
                "Thread ignored."
              )
            }
          >
            Ignore this thread
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              run(
                () =>
                  resolve({
                    gmailThreadId,
                    action: "ignore",
                    ignoreSenderAlways: true,
                  }),
                `${senderEmail} will always be ignored.`
              )
            }
          >
            Always ignore {senderEmail}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to an existing contact</DialogTitle>
            <DialogDescription>
              Attach this thread from {senderEmail} to a contact.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts…"
            autoFocus
          />
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                No matching contacts.
              </p>
            ) : (
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    run(
                      () =>
                        resolve({
                          gmailThreadId,
                          action: "link",
                          contactId: option.id,
                        }),
                      `Linked to ${option.name}.`
                    )
                  }
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    <span className="font-medium">{option.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {option.email}
                    </span>
                  </span>
                  {option.organization ? (
                    <span className="text-xs text-muted-foreground">
                      {option.organization}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
