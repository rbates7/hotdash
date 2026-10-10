"use client"

import type * as React from "react"

import type { Case } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCrm } from "@/components/crm/crm-store"
import {
  CRM_44,
  CRM_DANGER_TEXT,
  CRM_DIALOG,
  CRM_DIALOG_HEADER,
} from "@/components/crm/crm-touch"

/**
 * The delete confirms, controlled so the detail pages, the phone sheet and
 * the tablet row menu all open the same dialog. `finalFocus` says where focus
 * lands when the opener is gone (a deleted record's card).
 */
type ConfirmControl = {
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"]
}

export function CaseDeleteDialog({
  caseRow,
  open,
  onOpenChange,
  finalFocus,
}: { caseRow: Pick<Case, "id" | "caseNumber" | "subject"> } & ConfirmControl) {
  const { deleteCase } = useCrm()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm!", CRM_DIALOG)} finalFocus={finalFocus}>
        <DialogHeader className={CRM_DIALOG_HEADER}>
          <DialogTitle>Delete this case?</DialogTitle>
          <DialogDescription>
            #{caseRow.caseNumber} {caseRow.subject} comes off the list. There is no server copy to
            recover it from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className={CRM_44} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            className={cn(CRM_44, CRM_DANGER_TEXT)}
            onClick={() => {
              deleteCase(caseRow.id)
              onOpenChange(false)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ContactDeleteDialog({
  contactId,
  name,
  open,
  onOpenChange,
  finalFocus,
}: { contactId: string; name: string } & ConfirmControl) {
  const { deleteContact } = useCrm()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm!", CRM_DIALOG)} finalFocus={finalFocus}>
        <DialogHeader className={CRM_DIALOG_HEADER}>
          <DialogTitle>Delete this contact?</DialogTitle>
          <DialogDescription>
            {name} and their cases come off the list. There is no server copy to recover from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className={CRM_44} onClick={() => onOpenChange(false)}>
            Keep them
          </Button>
          <Button
            variant="destructive"
            className={cn(CRM_44, CRM_DANGER_TEXT)}
            onClick={() => {
              deleteContact(contactId)
              onOpenChange(false)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
