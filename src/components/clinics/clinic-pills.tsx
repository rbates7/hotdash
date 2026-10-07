import {
  ATTENDANCE_LABEL,
  CLINIC_TYPE_LABEL,
  STATUS_LABEL,
  type Attendance,
  type ClinicType,
  type Status,
} from "@/lib/clinics"
import { cn } from "@/lib/utils"

const PILL =
  "text-caption inline-flex h-[22px] items-center rounded-full px-2 font-semibold tracking-tight whitespace-nowrap"

/**
 * Solid fills only — every pill's text is measured for contrast in the
 * e2e, light and dark, so nothing here leans on an alpha over a hover row.
 */
const STATUS_TONE: Record<Status, string> = {
  upcoming: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  skipped: "bg-muted text-muted-foreground",
  unconfirmed: "bg-muted text-foreground border border-dashed border-faint-foreground",
}

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span data-testid="status-pill" data-status={status} className={cn(PILL, STATUS_TONE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TypePill({ type, className }: { type: ClinicType; className?: string }) {
  return (
    <span
      data-testid="type-pill"
      className={cn(
        PILL,
        "border",
        type === "zoom"
          ? "bg-surface text-muted-foreground border-surface-border"
          : "bg-muted text-foreground border-border",
        className
      )}
    >
      {CLINIC_TYPE_LABEL[type]}
    </span>
  )
}

// Status text on the card surface uses the shared text-safe tokens.
const ATTENDANCE_TONE: Record<Attendance, string> = {
  planned: "text-foreground",
  attended: "text-success-text",
  skipped: "text-muted-foreground",
}

/** Plain text, not a pill: the Status column already carries the colour. */
export function AttendanceText({ attendance }: { attendance: Attendance }) {
  return (
    <span data-testid="attendance" className={cn("text-label font-medium", ATTENDANCE_TONE[attendance])}>
      {ATTENDANCE_LABEL[attendance]}
    </span>
  )
}
