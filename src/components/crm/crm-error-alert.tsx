"use client"

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CRM_44, CRM_DANGER_TEXT } from "@/components/crm/crm-touch"

/**
 * Shared CRM crash UI. Used by the route `error.tsx` and by the client
 * boundary inside CrmProvider so Reset can re-seed memory, not just clear
 * the storage key.
 */
export function CrmErrorAlert({
  error,
  onRetry,
  onReset,
}: {
  error: Error & { digest?: string }
  onRetry: () => void
  onReset: () => void
}) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto mt-10 flex max-w-lg flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-destructive size-5" aria-hidden />
        <h1 className="text-title-sm font-semibold tracking-tight">CRM couldn’t render</h1>
      </div>
      <p className="text-body text-muted-foreground">
        Something in this browser’s saved copy of the CRM could not be read. Nothing is stored on a
        server; resetting discards the saved copy and shows the sample conversations again.
      </p>
      {error.digest && (
        <p className="text-micro text-muted-foreground font-mono">ref {error.digest}</p>
      )}
      <div className="flex gap-2 max-md:flex-wrap">
        <Button variant="outline" className={CRM_44} onClick={onRetry}>
          Try again
        </Button>
        <Button variant="destructive" className={cn(CRM_44, CRM_DANGER_TEXT)} onClick={onReset}>
          <RotateCcwIcon aria-hidden />
          Reset and clear saved copy
        </Button>
      </div>
    </div>
  )
}
