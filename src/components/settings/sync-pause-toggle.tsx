"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function SyncPauseToggle({ paused }: { paused: boolean }) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleChange(checked: boolean) {
    setIsBusy(true)
    try {
      const response = await fetch("/api/sync/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !checked }),
      })
      if (!response.ok) throw new Error("Failed to update.")
      toast.success(!checked ? "Automatic sync paused." : "Automatic sync resumed.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Label className="gap-2.5">
      <Switch
        checked={!paused}
        onCheckedChange={handleChange}
        disabled={isBusy}
      />
      Automatic sync {paused ? "paused" : "on"}
    </Label>
  )
}
