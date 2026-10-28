import Link from "next/link"

import {
  formatDay,
  formatMonthYear,
  orgInitials,
  renewalTag,
  renewalTagLabel,
  seatChip,
  seatChipLabel,
  seatFillPct,
  type AccountOrg,
  type AccountUser,
  type SeatChip,
} from "@/lib/crm/accounts/model"
import { agoLabel } from "@/lib/crm/selectors"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlanBadge } from "@/components/crm/cases/case-badges"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { ConnectingBadge } from "@/components/connecting-badge"
import { NotConnectedBadge } from "@/components/home/not-connected"

/* ------------------------------------------------------------------ chips */

// Colours carry `!`: Nova's unlayered `.cn-badge-variant-*` beats a plain utility.

const CHIP_CLASSES: Record<SeatChip["kind"], string> = {
  open: "bg-success/15! text-success-text!",
  full: "bg-warning/15! text-warning-text!",
  over: "bg-destructive/15! text-danger-text!",
}

const BAR_CLASSES: Record<SeatChip["kind"], string> = {
  open: "bg-success",
  full: "bg-warning",
  over: "bg-destructive",
}

export function SeatChipBadge({ used, total, className }: { used: number; total: number | null; className?: string }) {
  const chip = seatChip(used, total)
  if (!chip) return null
  return (
    <Badge variant="secondary" data-testid="seat-chip" data-kind={chip.kind} className={cn("border-transparent", CHIP_CLASSES[chip.kind], className)}>
      {seatChipLabel(chip)}
    </Badge>
  )
}

export function QuietTag({ children, strike }: { children: React.ReactNode; strike?: boolean }) {
  return (
    <Badge variant="outline" className={cn("text-muted-foreground", strike && "line-through")}>
      {children}
    </Badge>
  )
}

/** "used / total seats", a fill bar and the chip; canceled orgs get a quiet tag instead. */
export function SeatsCell({ org }: { org: AccountOrg }) {
  if (org.seatsTotal === null) {
    return <span className="text-muted-foreground text-caption">No subscription</span>
  }
  const chip = seatChip(org.seatsUsed, org.seatsTotal)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[0.8rem] whitespace-nowrap tabular-nums">
          {org.seatsUsed} / {org.seatsTotal} seats
        </span>
        <SeatBar used={org.seatsUsed} total={org.seatsTotal} kind={org.canceled ? null : (chip?.kind ?? null)} className="w-full max-w-28" />
      </div>
      {org.canceled ? <QuietTag>Canceled</QuietTag> : <SeatChipBadge used={org.seatsUsed} total={org.seatsTotal} />}
    </div>
  )
}

export function SeatBar({
  used,
  total,
  kind,
  className,
}: {
  used: number
  total: number | null
  kind: SeatChip["kind"] | null
  className?: string
}) {
  const pct = seatFillPct(used, total)
  return (
    <span
      role="meter"
      aria-label="Seats used"
      aria-valuemin={0}
      aria-valuemax={total ?? 0}
      aria-valuenow={used}
      className={cn("bg-muted block h-1 overflow-hidden rounded-full", className)}
    >
      <span className={cn("block h-full rounded-full", kind ? BAR_CLASSES[kind] : "bg-muted-foreground/40")} style={{ width: `${pct}%` }} />
    </span>
  )
}

export function RenewalTagBadge({ org, nowMs }: { org: AccountOrg; nowMs: number }) {
  const tag = renewalTag(org, nowMs)
  if (!tag) return null
  return (
    <Badge
      variant="secondary"
      data-testid="renewal-tag"
      data-kind={tag.kind}
      className={cn(
        "border-transparent",
        tag.kind === "lapsed" ? "bg-destructive/15! text-danger-text!" : "bg-warning/15! text-warning-text!"
      )}
    >
      {renewalTagLabel(tag)}
    </Badge>
  )
}

/** The Renews cell: Lapsed + when it ended, or the date + "in N days". */
export function RenewsCell({ org, nowMs }: { org: AccountOrg; nowMs: number }) {
  if (!org.renewsAt && !org.canceled) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      {org.canceled ? <RenewalTagBadge org={org} nowMs={nowMs} /> : null}
      <span className="font-mono text-[0.8rem] tabular-nums">{formatDay(org.renewsAt)}</span>
      {org.canceled ? null : <RenewalTagBadge org={org} nowMs={nowMs} />}
    </span>
  )
}

/** Phone: "Renews Nov 9, 2026", "Trial ends …", "Cancels …", or "ended …" after Lapsed. */
export function renewsPhrase(org: AccountOrg) {
  if (!org.renewsAt) return null
  const day = formatDay(org.renewsAt)
  switch (org.renewalKind) {
    case "trial_ends":
      return `Trial ends ${day}`
    case "cancels":
      return `Cancels ${day}`
    case "ended":
      return `ended ${day}`
    default:
      return `Renews ${day}`
  }
}

export function OrgPlanChip({ org }: { org: AccountOrg }) {
  if (org.canceled) return <QuietTag strike>{org.plan ?? "Canceled"}</QuietTag>
  if (!org.plan) return <span className="text-muted-foreground">—</span>
  return <QuietTag>{org.plan}</QuietTag>
}

export function OrgAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-muted text-muted-foreground text-[0.7rem] font-semibold">{orgInitials(name)}</AvatarFallback>
    </Avatar>
  )
}

/* ------------------------------------------------------------------ tiles */

export type TileState = "live" | "loading" | "not_connected" | "unauthorized"

export function StatTile({
  label,
  value,
  sub,
  state,
  icon,
  testId,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  state: TileState
  icon?: React.ReactNode
  testId?: string
}) {
  return (
    <div data-testid={testId} className="bg-surface border-surface-border flex min-w-0 flex-col gap-1 rounded-xl border px-4 py-3">
      <div className="text-caption text-muted-foreground flex items-center justify-between gap-2 tracking-tight">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      {state === "not_connected" ? (
        <NotConnectedBadge className="self-start" />
      ) : state === "unauthorized" ? (
        <span className="text-muted-foreground text-label">Sign in to see</span>
      ) : state === "loading" ? (
        <ConnectingBadge className="self-start" />
      ) : (
        <>
          <span className="font-mono text-xl font-semibold tabular-nums">{value}</span>
          {sub ? <span className="text-caption text-muted-foreground truncate">{sub}</span> : null}
        </>
      )}
    </div>
  )
}

/** "Last updated 5m ago" for a stale copy; "Last tried 5m ago" when Stripe or the database failed. */
export function FreshnessNote({
  status,
  lastSyncedAt,
  lastTriedAt,
  nowMs,
}: {
  status: string
  lastSyncedAt: string | null
  lastTriedAt: string | null
  nowMs: number
}) {
  if (status === "stale" && lastSyncedAt) {
    return (
      <p data-testid="accounts-stale" className="text-caption text-warning-text tracking-tight">
        Last updated {agoLabel(lastSyncedAt, nowMs)}
      </p>
    )
  }
  if (status === "not_connected" && lastTriedAt) {
    return (
      <p data-testid="accounts-last-tried" className="text-caption text-muted-foreground tracking-tight">
        Last tried {agoLabel(lastTriedAt, nowMs)}
      </p>
    )
  }
  return null
}

/* ------------------------------------------------------------------ users */

/** Users in the Contacts row style: Name, Email, Organization, Started, Plan. */
export function UsersTable({ users, label, className }: { users: readonly AccountUser[]; label: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border", className)}>
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Plan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link href={`/crm/contacts/${u.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <CrmAvatar name={u.name} />
                  {u.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-[0.8rem]">{u.email}</TableCell>
              <TableCell className="text-muted-foreground">{u.organization ?? "— None"}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-[0.8rem]">{formatMonthYear(u.startedAt)}</TableCell>
              <TableCell>
                <PlanBadge plan={u.plan} planStatus={u.planStatus} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Phone: one stacked line per user, the whole line a 44px link. */
export function UserCards({ users, label }: { users: readonly AccountUser[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-border flex flex-col divide-y">
      {users.map((u) => (
        <li key={u.id}>
          <Link href={`/crm/contacts/${u.id}`} className="flex min-h-11 items-center gap-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{u.name}</span>
              <span className="text-muted-foreground truncate font-mono text-[0.75rem]">{u.email}</span>
              <span className="text-muted-foreground text-caption">Started {formatMonthYear(u.startedAt)}</span>
            </span>
            <PlanBadge plan={u.plan} planStatus={u.planStatus} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
