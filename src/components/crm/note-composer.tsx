"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useCrm } from "@/components/crm/crm-store"
import { CRM_44 } from "@/components/crm/crm-touch"

export function NoteComposer({ caseId }: { caseId: string }) {
  const { addNote } = useCrm()
  const [body, setBody] = React.useState("")

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!body.trim()) return
        addNote(caseId, body)
        setBody("")
      }}
      className="flex flex-col gap-2"
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add an internal note… (only you see these)"
        aria-label="Internal note"
        rows={3}
        required
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" className={CRM_44} disabled={!body.trim()}>
          Add note
        </Button>
      </div>
    </form>
  )
}
