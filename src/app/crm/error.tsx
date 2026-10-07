"use client"

import * as React from "react"

import { CrmErrorAlert } from "@/components/crm/crm-error-alert"
import { clearState } from "@/components/crm/crm-store"

/**
 * Last line of defence for this route. The store lives in the page
 * (CrmApp), so a remount after Reset builds a fresh provider from empty
 * storage and the seed. clearState first so hydrate cannot revive a
 * broken copy.
 */
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
    <CrmErrorAlert
      error={error}
      onRetry={reset}
      onReset={() => {
        clearState(window.localStorage)
        reset()
      }}
    />
  )
}
