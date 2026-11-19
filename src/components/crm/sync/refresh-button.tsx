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
  fullBackfill = false,
  catchUp = false,
}: {
  source: "gmail" | "stripe" | "supabase" | "all"
  label?: string
  /** Clears the Gmail cursor and restarts the configured backfill window. */
  fullBackfill?: boolean
  /** Gmail only: pulls mail since the last successful sync, then resets the cursor. */
  catchUp?: boolean
}) {
  const router = useRouter()
  const [isRunning, setIsRunning] = React.useState(false)

  async function handleClick() {
    setIsRunning(true)
    try {
      const query =
        source !== "gmail"
          ? ""
          : catchUp
            ? "?catchup=1"
            : fullBackfill
              ? "?full=1"
              : ""
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
        if (payload.stats?.catchUpPending) {
          toast.success(
            summary
              ? `${summary}. More mail remains — click Catch up again.`
              : "Batch imported. Click Catch up again for more mail."
          )
        } else if (payload.stats?.backfillPending) {
          toast.success(
            summary
              ? `${summary}. More mail remains — run Sync again.`
              : "Batch imported. Run Sync again for more mail."
          )
        } else {
          toast.success(summary ? `Synced: ${summary}` : "Synced.")
        }
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
