"use client"

import type { ReactNode } from "react"

import { CrmErrorBoundary } from "@/components/crm/crm-error-boundary"
import { CrmProvider } from "@/components/crm/crm-store"
import { CrmShell } from "@/components/crm/crm-shell"

/**
 * Provider + shell live in the page (Sales/Clinics pattern), not
 * `crm/layout.tsx`, so `error.tsx` can catch a crash and remount a fresh
 * store from empty storage. The inner client boundary also re-seeds
 * memory when Reset is used without a route remount.
 */
export function CrmApp({
  nowMs,
  children,
}: {
  nowMs: number
  children: ReactNode
}) {
  return (
    <CrmProvider nowMs={nowMs}>
      <CrmErrorBoundary>
        <CrmShell>{children}</CrmShell>
      </CrmErrorBoundary>
    </CrmProvider>
  )
}
