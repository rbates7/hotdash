import {
  CRM_PRIORITY_LABELS,
  CRM_STATUS_LABELS,
  type CrmCaseStatus,
  type CrmPriority,
} from "@/lib/crm/case-view"
import { cn } from "@/lib/utils"

/**
 * Deke's badge recipe (CRM spec §1): radius 6, padding 2×8, medium 11.5.
 * The background is the status token tinted over `surface` — 12% in light,
 * 18% in dark — and the text is the matching text-safe `*-text` token.
 */
export const CRM_BADGE = "inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11.5px] leading-4 font-medium whitespace-nowrap"

// Written out in full (not built from the token name) so Tailwind sees every class.
const DANGER_TINT =
  "bg-[color-mix(in_srgb,var(--destructive)_12%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--destructive)_18%,var(--surface))] text-danger-text"

/**
 * `waiting_on_us` is the CRM's "New" (the customer wrote and the reply is
 * ours): info tint with the new `info-text` token, as the spec's New badge.
 */
export const STATUS_TONE: Record<CrmCaseStatus, string> = {
  waiting_on_us:
    "bg-[color-mix(in_srgb,var(--info)_12%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--info)_18%,var(--surface))] text-info-text",
  open: "bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--success)_18%,var(--surface))] text-success-text",
  waiting_on_them:
    "bg-[color-mix(in_srgb,var(--warning)_12%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--warning)_18%,var(--surface))] text-warning-text",
  closed:
    "bg-[color-mix(in_srgb,var(--muted-foreground)_12%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--muted-foreground)_18%,var(--surface))] text-muted-foreground",
}

export const PRIORITY_TONE: Record<CrmPriority, string> = {
  urgent: DANGER_TINT,
  high: DANGER_TINT,
  normal: "border-border text-foreground border bg-transparent",
  low: "border-border text-muted-foreground border bg-transparent",
}

export function CrmStatusBadge({ status, className }: { status: CrmCaseStatus; className?: string }) {
  return (
    <span data-testid="crm-status-badge" data-status={status} className={cn(CRM_BADGE, STATUS_TONE[status], className)}>
      {CRM_STATUS_LABELS[status]}
    </span>
  )
}

export function CrmPriorityBadge({ priority, className }: { priority: CrmPriority; className?: string }) {
  return (
    <span
      data-testid="crm-priority-badge"
      data-priority={priority}
      className={cn(CRM_BADGE, PRIORITY_TONE[priority], className)}
    >
      {CRM_PRIORITY_LABELS[priority]}
    </span>
  )
}
