"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

function summarize(stats: Record<string, number> | null | undefined) {
  if (!stats) return null
  const parts = Object.entries(stats)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key} ${value}`)
  return parts.length > 0 ? parts.join(", ") : "no changes"
}

export function RefreshButton({
  source,
  label = "Refresh",
  full = false,
  sent = false,
  confirm,
}: {
  source: "gmail" | "stripe" | "supabase" | "feedback" | "all"
  label?: string
  /** Re-read GMAIL_INITIAL_SYNC_WINDOW instead of resuming from the cursor. */
  full?: boolean
  /** Import only mail you sent over that window; the cursor is untouched. */
  sent?: boolean
  confirm?: string
}) {
  const router = useRouter()
  const [isRunning, setIsRunning] = React.useState(false)

  async function handleClick() {
    if (confirm && !window.confirm(confirm)) return
    setIsRunning(true)
    try {
      const query = full ? "?full=1" : sent ? "?sent=1" : ""
      const response = await fetch(`/api/crm/sync/${source}${query}`, {
        method: "POST",
      })
      const payload = (await response.json()) as {
        error?: string
        status?: string
        message?: string | null
        stats?: Record<string, number> | null
      }
      if (!response.ok) throw new Error(payload.error ?? "Sync failed.")
      if (payload.status === "error") {
        throw new Error(payload.message ?? "Sync failed.")
      }
      if (payload.message === "already_running") {
        toast.info("A sync is already running.")
      } else if (payload.status === "skipped") {
        toast.info(payload.message ?? "Sync skipped.")
      } else {
        const summary = summarize(payload.stats)
        toast.success(summary ? `Synced: ${summary}` : "Synced.")
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed.")
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isRunning}
    >
      <RefreshCwIcon className={isRunning ? "animate-spin" : undefined} />
      {isRunning ? "Syncing…" : label}
    </Button>
  )
}
