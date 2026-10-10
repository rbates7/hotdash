"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { contactDisplayName } from "@/lib/crm/crm"
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
import { cn } from "@/lib/utils"
import { useCrm } from "@/components/crm/crm-store"
import {
  CRM_44,
  CRM_DANGER_TEXT,
  CRM_DIALOG,
  CRM_DIALOG_HEADER,
  CRM_ICON_44,
  CRM_ROW_44,
} from "@/components/crm/crm-touch"

export function TriageActions({
  threadId,
  senderEmail,
  senderName,
}: {
  threadId: string
  senderEmail: string
  senderName: string | null
}) {
  const { contacts, organizations, promoteTriage, linkTriage, ignoreTriage, ignoreSender } =
    useCrm()
  const [isLinkOpen, setIsLinkOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const options = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts
      .filter((c) => {
        if (!q) return true
        const org = organizations.find((o) => o.id === c.organizationId)
        return (
          contactDisplayName(c).toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (org?.name.toLowerCase().includes(q) ?? false)
        )
      })
      .slice(0, 8)
  }, [contacts, organizations, query])

  return (
    <div className="flex items-center gap-1.5 max-md:flex-wrap">
      <Button size="sm" className={CRM_44} onClick={() => promoteTriage(threadId)}>
        Promote to case
      </Button>
      <Button size="sm" variant="outline" className={CRM_44} onClick={() => setIsLinkOpen(true)}>
        Link contact
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="More actions" className={CRM_ICON_44} />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className={CRM_ROW_44} onClick={() => ignoreTriage(threadId)}>
            Ignore this thread
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className={cn(CRM_ROW_44, CRM_DANGER_TEXT)}
            onClick={() => ignoreSender(senderEmail)}
          >
            Always ignore {senderEmail}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isLinkOpen}
        onOpenChange={(open) => {
          setIsLinkOpen(open)
          if (!open) setQuery("")
        }}
      >
        <DialogContent className={CRM_DIALOG}>
          <DialogHeader className={CRM_DIALOG_HEADER}>
            <DialogTitle>Link to an existing contact</DialogTitle>
            <DialogDescription>
              Attach {senderName ?? senderEmail}’s thread to someone already in the CRM.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts…"
            aria-label="Search contacts to link"
            className={CRM_44}
          />
          {/* 44px rows below 1280 outgrow max-h-64; the dialog itself scrolls on a phone. */}
          <ul className="flex max-h-64 flex-col gap-1 max-xl:max-h-none">
            {options.length === 0 ? (
              <li className="text-muted-foreground px-1 py-4 text-center text-sm">No matches.</li>
            ) : (
              options.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    className={cn(
                      "hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                      "max-xl:min-h-11 max-xl:gap-2 max-md:flex-wrap"
                    )}
                    onClick={() => {
                      linkTriage(threadId, contact.id)
                      setIsLinkOpen(false)
                    }}
                  >
                    <span className="font-medium">{contactDisplayName(contact)}</span>
                    <span className="text-muted-foreground text-xs">{contact.email}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
