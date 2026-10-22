"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const BATCH_PAUSE_MS = 15_000
const QUOTA_PAUSE_MS = 60_000
const ALREADY_RUNNING_PAUSE_MS = 8_000
const MAX_QUOTA_RETRIES = 8

type SyncPayload = {
  error?: string
  status?: string
  message?: string | null
  stats?: Record<string, number> | null
}

function isQuotaError(message: string | null | undefined) {
  if (!message) return false
  return /quota exceeded|rate limit|userRateLimitExceeded/i.test(message)
}

function summarizeStats(stats: Record<string, number> | null | undefined) {
  if (!stats) return null
  const parts = Object.entries(stats)
    .filter(([key, value]) => key !== "backfillPending" && value > 0)
    .map(([key, value]) => `${key} ${value}`)
  return parts.length > 0 ? parts.join(", ") : null
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function runGmailBatch(restart: boolean, restartAlreadyUsed: boolean) {
  const useFull = restart && !restartAlreadyUsed
  const query = useFull ? "?full=1" : ""
  const response = await fetch(`/api/crm/sync/gmail${query}`, { method: "POST" })
  const payload = (await response.json()) as SyncPayload
  return { response, payload, usedRestart: useFull }
}

export function GmailAutoBackfillButton({
  disabled,
}: {
  disabled?: boolean
}) {
  const router = useRouter()
  const [running, setRunning] = React.useState(false)
  const [status, setStatus] = React.useState<string | null>(null)
  const abortRef = React.useRef(false)

  React.useEffect(() => {
    return () => {
      abortRef.current = true
    }
  }, [])

  async function runAutomatic(restart: boolean) {
    if (restart) {
      const ok = window.confirm(
        "Restart the Gmail backfill from June 1, 2026? Already-imported messages are kept; this only resets the import cursor."
      )
      if (!ok) return
    }

    abortRef.current = false
    setRunning(true)
    let batch = 0
    let quotaRetries = 0
    let restartUsed = false

    try {
      for (;;) {
        if (abortRef.current) break

        batch += 1
        setStatus(`Importing batch ${batch}…`)

        const { response, payload, usedRestart } = await runGmailBatch(
          restart,
          restartUsed
        )
        if (usedRestart) restartUsed = true

        if (payload.message === "already_running") {
          setStatus("Waiting for the current sync to finish…")
          await sleep(ALREADY_RUNNING_PAUSE_MS)
          batch -= 1
          continue
        }

        if (
          !response.ok ||
          payload.status === "error" ||
          payload.status === "skipped"
        ) {
          const message =
            payload.message ?? payload.error ?? "Gmail sync failed."
          if (isQuotaError(message) && quotaRetries < MAX_QUOTA_RETRIES) {
            quotaRetries += 1
            setStatus(
              `Gmail quota — pausing 60s (retry ${quotaRetries}/${MAX_QUOTA_RETRIES})…`
            )
            await sleep(QUOTA_PAUSE_MS)
            batch -= 1
            continue
          }
          throw new Error(message)
        }

        quotaRetries = 0
        const summary = summarizeStats(payload.stats)
        const pending = Boolean(payload.stats?.backfillPending)

        if (!pending) {
          toast.success(
            summary
              ? `Backfill complete after ${batch} batches (${summary}).`
              : `Backfill complete after ${batch} batches.`
          )
          break
        }

        setStatus(
          summary
            ? `Batch ${batch} done (${summary}). Next batch in 15s…`
            : `Batch ${batch} done. Next batch in 15s…`
        )
        await sleep(BATCH_PAUSE_MS)
      }

      if (!abortRef.current) router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Automatic backfill stopped."
      )
    } finally {
      setRunning(false)
      setStatus(null)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void runAutomatic(false)}
          disabled={disabled || running}
        >
          {running ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlayIcon />
          )}
          {running ? "Backfilling…" : "Run backfill automatically"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => void runAutomatic(true)}
          disabled={disabled || running}
        >
          Restart from June 1
        </Button>
      </div>
      {status ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  )
}
