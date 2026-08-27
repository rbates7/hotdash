"use client"

import * as React from "react"
import { LayersIcon, PlusIcon } from "lucide-react"

import {
  BOARD_FILTERS,
  STATUS_CONFIG,
  STATUS_ORDER,
  type BoardFilter,
  activeSprint,
  actorById,
  daysUntil,
  formatDay,
  issuesByStatus,
  issuesInSprint,
  matchesFilter,
  workingAgentIds,
} from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { CreateIssueDialog } from "@/components/agent-workplace/create-issue-dialog"
import { IssueCard } from "@/components/agent-workplace/issue-card"
import { useIssues } from "@/components/agent-workplace/issues-store"

/**
 * Avatar stack + count. Deliberately three-state: an unresolved roster and a
 * genuinely idle one are different claims and must not render alike.
 */
function AgentsWorkingPill({
  agentIds,
  actors,
}: {
  agentIds: string[]
  actors: ReturnType<typeof useIssues>["actors"]
}) {
  const working = agentIds.length > 0

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-lg border px-2.5",
        working
          ? "border-brand/28 bg-brand/7 text-foreground"
          : "border-border text-muted-foreground"
      )}
    >
      {working && (
        <span className="flex -space-x-1.5">
          {agentIds.slice(0, 3).map((id) => (
            <ActorAvatar
              key={id}
              actor={actorById(actors, id)}
              size="sm"
              className="ring-surface rounded-full ring-2"
            />
          ))}
        </span>
      )}
      <span className="text-caption font-medium">
        {agentIds.length} {agentIds.length === 1 ? "agent" : "agents"} working
      </span>
    </span>
  )
}

export function IssuesBoard({
  onOpenIssue,
}: {
  onOpenIssue: (key: string) => void
}) {
  const { issues, sprints, actors, now } = useIssues()
  const [filter, setFilter] = React.useState<BoardFilter>("all")

  const sprint = activeSprint(sprints)
  const sprintIssues = issuesInSprint(issues, sprint?.id ?? null)
  const visible = sprintIssues.filter((i) => matchesFilter(i, filter, actors))
  const agentIds = workingAgentIds(sprintIssues, actors)

  if (!sprint) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-24 text-center">
        <LayersIcon className="text-faint-foreground size-8" aria-hidden />
        <p className="text-body text-foreground font-medium">
          No sprint is running
        </p>
        <p className="text-caption max-w-sm text-balance">
          The board shows the active sprint. Start one from the Backlog tab to
          see work here.
        </p>
      </div>
    )
  }

  const remaining = daysUntil(sprint.endDate, now)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-title-sm font-semibold">{sprint.name}</h2>
            <span className="text-caption text-muted-foreground">
              {formatDay(sprint.startDate)} – {formatDay(sprint.endDate)}
            </span>
            <span
              className={cn(
                "text-micro rounded-full px-1.5 py-0.5 font-medium",
                remaining < 0
                  ? "bg-destructive/10 text-destructive"
                  : remaining <= 2
                    ? "bg-warning/10 text-warning"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {remaining < 0
                ? `${Math.abs(remaining)}d overdue`
                : `${remaining}d left`}
            </span>
          </div>
          {sprint.goal && (
            <p className="text-caption text-muted-foreground mt-0.5">
              {sprint.goal}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <AgentsWorkingPill agentIds={agentIds} actors={actors} />
          <CreateIssueDialog
            defaultSprintId={sprint.id}
            trigger={
              <Button size="sm">
                <PlusIcon aria-hidden />
                New issue
              </Button>
            }
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Filter issues"
        className="bg-muted inline-flex w-fit gap-0.5 rounded-lg p-0.5"
      >
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            type="button"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "text-caption rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === f.value
                ? "bg-surface text-foreground shadow-[var(--surface-shadow)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUS_ORDER.map((status) => {
          const config = STATUS_CONFIG[status]
          const columnIssues = issuesByStatus(visible, status)
          return (
            <section
              key={status}
              aria-label={config.label}
              className={cn(
                "flex w-[280px] shrink-0 flex-col gap-2 rounded-xl p-2",
                config.columnBg
              )}
            >
              <header className="flex items-center gap-1.5 px-1.5">
                <config.icon
                  className={cn("size-3.5", config.iconColor)}
                  aria-hidden
                />
                <h3 className="text-caption font-semibold">{config.label}</h3>
                <span className="text-caption text-muted-foreground">
                  {columnIssues.length}
                </span>
              </header>
              <div className="flex min-h-[120px] flex-col gap-2">
                {columnIssues.map((issue) => (
                  <IssueCard
                    key={issue.key}
                    issue={issue}
                    actors={actors}
                    now={now}
                    onOpen={onOpenIssue}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
