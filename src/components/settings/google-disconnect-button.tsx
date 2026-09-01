"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function GoogleDisconnectButton() {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleClick() {
    if (!window.confirm("Disconnect Google? Email sync will stop.")) return
    setIsBusy(true)
    try {
      const response = await fetch("/api/google/disconnect", { method: "POST" })
      if (!response.ok) throw new Error("Failed to disconnect.")
      toast.success("Google disconnected.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} disabled={isBusy}>
      Disconnect
    </Button>
  )
}
