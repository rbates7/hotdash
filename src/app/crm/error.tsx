"use client"

import * as React from "react"
import { AlertTriangleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[crm] render failed", error)
  }, [error])

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto mt-10 flex max-w-lg flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-destructive size-5" aria-hidden />
        <h1 className="font-semibold tracking-tight">CRM couldn’t load</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        The CRM could not reach its data service. Try again; your saved cases
        and notes are not changed by this error.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">
          ref {error.digest}
        </p>
      ) : null}
      <div>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
