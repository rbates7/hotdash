"use client"

import * as React from "react"
import { LayersIcon, PlusIcon } from "lucide-react"

import {
  BOARD_FILTERS,
  STATUS_CONFIG,
  STATUS_ORDER,
  type BoardFilter,
  type IssueStatus,
  activeSprint,
  daysUntil,
  formatDay,
  issuesByStatus,
  issuesInSprint,
  matchesFilter,
  workingAgentIds,
} from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CreateIssueDialog } from "@/components/agent-workplace/create-issue-dialog"
import { IssueCard } from "@/components/agent-workplace/issue-card"
import { useIssues } from "@/components/agent-workplace/issues-store"
import {
  WORKPLACE_BOARD,
  WORKPLACE_BOARD_COLUMN,
  WORKPLACE_BOARD_META,
  WORKPLACE_BOARD_TOOLBAR,
  WORKPLACE_FILTER,
  WORKPLACE_TOUCH,
} from "@/components/agent-workplace/responsive"
import { StatusSwitcher } from "@/components/agent-workplace/status-switcher"

/** Green "3 agents working" pill with a pulsing dot, as in the mock. */
export function AgentsWorkingPill({ count }: { count: number }) {
  return (
    <span className="bg-success/10 text-success-text inline-flex h-7 shrink-0 items-center gap-[7px] rounded-full pr-2.5 pl-2 text-caption font-semibold">
      <span
        aria-hidden
        className={cn(
          "bg-success ring-success/25 size-[7px] rounded-full ring-[3px]",
          count > 0 && "animate-pulse"
        )}
      />
      {count} {count === 1 ? "agent" : "agents"} working
    </span>
  )
}

export function FilterChips({
  value,
  onChange,
}: {
  value: BoardFilter
  onChange: (next: BoardFilter) => void
}) {
  return (
    <div
      role="group"
      aria-label="Issue filters"
      className="flex items-center gap-1.5 overflow-x-auto max-md:flex-nowrap md:flex-wrap"
    >
      {BOARD_FILTERS.map((f) => {
        const on = value === f.value
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(f.value)}
            className={cn(
              WORKPLACE_FILTER,
              on
                ? "border-foreground bg-foreground text-background"
                : "border-surface-border bg-surface text-foreground hover:bg-surface-hover"
            )}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

export function IssuesBoard({
  onOpenIssue,
}: {
  onOpenIssue: (key: string) => void
}) {
  const { issues, sprints, actors, now } = useIssues()
  const [filter, setFilter] = React.useState<BoardFilter>("all")
  const [statusView, setStatusView] = React.useState<IssueStatus>("todo")

  const sprint = activeSprint(sprints)
  const sprintIssues = issuesInSprint(issues, sprint?.id ?? null)
  const visible = sprintIssues.filter((i) => matchesFilter(i, filter, actors))
  const working = workingAgentIds(sprintIssues, actors).length

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
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, issuesByStatus(visible, status).length])
  ) as Record<IssueStatus, number>

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className={WORKPLACE_BOARD_TOOLBAR}>
        <FilterChips value={filter} onChange={setFilter} />

        <div className={WORKPLACE_BOARD_META}>
          <span className="text-caption text-muted-foreground tabular-nums">
            {sprint.name} · {formatDay(sprint.startDate)} –{" "}
            {formatDay(sprint.endDate)} ·{" "}
            {remaining < 0
              ? `${Math.abs(remaining)}d overdue`
              : `${remaining}d left`}
          </span>
          <AgentsWorkingPill count={working} />
          <CreateIssueDialog
            defaultSprintId={sprint.id}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className={cn("rounded-full", WORKPLACE_TOUCH)}
              >
                <PlusIcon aria-hidden />
                New issue
              </Button>
            }
          />
        </div>
      </div>

      <StatusSwitcher
        value={statusView}
        counts={counts}
        onChange={setStatusView}
      />

      <div className={WORKPLACE_BOARD}>
        {STATUS_ORDER.map((status) => {
          const config = STATUS_CONFIG[status]
          const columnIssues = issuesByStatus(visible, status)
          return (
            <section
              key={status}
              aria-label={config.label}
              className={cn(
                WORKPLACE_BOARD_COLUMN,
                status !== statusView && "max-md:hidden"
              )}
            >
              <header className="flex min-h-6 items-center justify-between gap-2 px-0.5 pb-0.5 max-md:hidden md:flex">
                <h3 className="text-caption font-semibold tracking-tight">
                  {config.label}
                </h3>
                <span className="text-micro text-muted-foreground bg-muted grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums">
                  {columnIssues.length}
                </span>
              </header>
              {columnIssues.map((issue) => (
                <IssueCard
                  key={issue.key}
                  issue={issue}
                  actors={actors}
                  onOpen={onOpenIssue}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
