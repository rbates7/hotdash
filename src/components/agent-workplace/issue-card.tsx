"use client"

import type { Actor, Issue } from "@/lib/issues"
import { PRIORITY_CONFIG, actorById, formatRelative } from "@/lib/issues"
import { cn } from "@/lib/utils"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"

export function IssueCard({
  issue,
  actors,
  now,
  onOpen,
}: {
  issue: Issue
  actors: Actor[]
  now: Date
  onOpen: (key: string) => void
}) {
  const assignee = actorById(actors, issue.assigneeId)
  const priority = PRIORITY_CONFIG[issue.priority]

  return (
    <button
      type="button"
      onClick={() => onOpen(issue.key)}
      className={cn(
        "bg-surface border-surface-border hover:border-foreground/15 hover:bg-surface-hover",
        "focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-3 text-left",
        "shadow-[var(--surface-shadow)] transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
      )}
    >
      <div className="flex items-center gap-1.5">
        <priority.icon
          className={cn("size-3.5 shrink-0", priority.color)}
          aria-label={priority.label}
        />
        <span className="text-micro text-muted-foreground font-mono">
          {issue.key}
        </span>
        {issue.isAgentWorking && (
          <span className="text-micro text-success bg-success/10 ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium">
            <span className="bg-success size-1.5 rounded-full" aria-hidden />
            Working
          </span>
        )}
      </div>

      <p className="text-body mt-1 leading-snug font-medium">{issue.title}</p>

      {issue.description && (
        <p className="text-caption text-muted-foreground mt-1 truncate">
          {issue.description}
        </p>
      )}

      {issue.blockerReason && (
        <p className="text-caption text-destructive mt-1.5 leading-snug">
          {issue.blockerReason}
        </p>
      )}

      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.map((label) => (
            <span
              key={label}
              className="text-micro text-muted-foreground bg-muted/60 inline-flex rounded-full px-1.5 py-0.5"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <ActorAvatar actor={assignee} size="sm" showPresence />
        <span className="text-micro text-faint-foreground">
          {formatRelative(issue.updatedAt, now)}
        </span>
      </div>
    </button>
  )
}
