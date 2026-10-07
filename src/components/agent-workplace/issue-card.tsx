"use client"

import type { Actor, Issue } from "@/lib/issues"
import { actorById } from "@/lib/issues"
import { cn } from "@/lib/utils"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"

export function WorkingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-success/10 text-success inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[10px] font-semibold tracking-wide uppercase",
        className
      )}
    >
      Working
    </span>
  )
}

export function IssueCard({
  issue,
  actors,
  onOpen,
}: {
  issue: Issue
  actors: Actor[]
  onOpen: (key: string) => void
}) {
  const assignee = actorById(actors, issue.assigneeId)

  return (
    <button
      type="button"
      onClick={() => onOpen(issue.key)}
      className={cn(
        "bg-surface border-surface-border hover:border-foreground/15 hover:bg-surface-hover",
        "focus-visible:ring-ring/50 flex w-full min-w-0 flex-col gap-2 rounded-xl border px-3 pt-3 pb-[11px] text-left",
        "transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
      )}
    >
      <p className="text-label line-clamp-2 leading-[1.35] font-semibold tracking-tight">
        {issue.title}
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-micro text-muted-foreground font-medium tracking-wide tabular-nums">
          {issue.key}
        </span>
        {issue.isAgentWorking && <WorkingBadge />}
      </div>

      <div className="flex min-w-0 items-center gap-[7px]">
        <ActorAvatar actor={assignee} size="md" />
        <span className="text-micro text-muted-foreground truncate font-medium">
          {assignee?.name ?? "Unassigned"}
        </span>
      </div>

      {issue.blockerReason && (
        <p className="text-micro rounded-lg bg-amber-50 px-2 py-1.5 leading-[1.35] font-medium text-amber-700 dark:bg-amber-400/12 dark:text-amber-300">
          {issue.blockerReason}
        </p>
      )}
    </button>
  )
}
