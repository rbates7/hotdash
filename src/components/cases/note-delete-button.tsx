"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { TrashIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function NoteDeleteButton({ noteId }: { noteId: string }) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleClick() {
    setIsBusy(true)
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Failed to delete the note.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
      setIsBusy(false)
    }
  }

  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Delete note"
      onClick={handleClick}
      disabled={isBusy}
      className="text-muted-foreground hover:text-destructive"
    >
      <TrashIcon />
    </Button>
  )
}
