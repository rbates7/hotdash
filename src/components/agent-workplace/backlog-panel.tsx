"use client"

import * as React from "react"
import { ChevronDownIcon, PlusIcon } from "lucide-react"

import type { Issue } from "@/lib/issues"
import {
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  activeSprint,
  actorById,
  backlogIssues,
  formatDay,
  issuesInSprint,
  plannedSprints,
  sprintProgress,
} from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { CreateIssueDialog } from "@/components/agent-workplace/create-issue-dialog"
import { useIssues } from "@/components/agent-workplace/issues-store"

function Section({
  title,
  meta,
  actions,
  children,
  defaultOpen = true,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="border-surface-border bg-surface rounded-xl border"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="hover:bg-muted -ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5"
            />
          }
        >
          <ChevronDownIcon
            className="text-muted-foreground size-4 transition-transform data-[panel-open]:rotate-0"
            aria-hidden
          />
          <span className="text-body font-semibold">{title}</span>
        </CollapsibleTrigger>
        {meta}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <CollapsibleContent>
        <div className="border-surface-border border-t">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** One dense row. Deliberately not a card — this is a planning list. */
function IssueRow({
  issue,
  onOpen,
}: {
  issue: Issue
  onOpen: (key: string) => void
}) {
  const { actors, sprints, patchIssue } = useIssues()
  const assignee = actorById(actors, issue.assigneeId)
  const priority = PRIORITY_CONFIG[issue.priority]
  const status = STATUS_CONFIG[issue.status]
  const assignable = sprints.filter((s) => s.status !== "completed")

  return (
    <div className="hover:bg-surface-hover border-surface-border grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-2 border-b px-3 py-2 last:border-b-0">
      <priority.icon
        className={cn("size-3.5", priority.color)}
        aria-label={priority.label}
      />
      <span className="text-micro text-muted-foreground w-16 font-mono">
        {issue.key}
      </span>
      <button
        type="button"
        onClick={() => onOpen(issue.key)}
        className="text-body min-w-0 truncate text-left hover:underline"
      >
        {issue.title}
      </button>
      <span className="text-caption text-muted-foreground hidden items-center gap-1 sm:inline-flex">
        <status.icon className={cn("size-3.5", status.iconColor)} aria-hidden />
        {status.label}
      </span>
      <ActorAvatar actor={assignee} size="sm" showPresence />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="text-caption text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-1.5 py-0.5"
            >
              {issue.sprintId
                ? (sprints.find((s) => s.id === issue.sprintId)?.name ??
                  "Sprint")
                : "Backlog"}
            </button>
          }
        />
        <PopoverContent className="w-44 p-1">
          <button
            type="button"
            onClick={() => patchIssue(issue.key, { sprintId: null })}
            className="text-body hover:bg-muted w-full rounded-md px-2 py-1.5 text-left"
          >
            Backlog
          </button>
          {assignable.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => patchIssue(issue.key, { sprintId: s.id })}
              className="text-body hover:bg-muted w-full rounded-md px-2 py-1.5 text-left"
            >
              {s.name}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-muted-foreground px-3 py-6 text-center">
      {children}
    </p>
  )
}

export function BacklogPanel({
  onOpenIssue,
}: {
  onOpenIssue: (key: string) => void
}) {
  const { issues, sprints, now, startSprint, completeSprint, createSprint } =
    useIssues()

  const current = activeSprint(sprints)
  const planned = plannedSprints(sprints)
  const currentIssues = issuesInSprint(issues, current?.id ?? null)
  const backlog = backlogIssues(issues)
  const progress = sprintProgress(currentIssues)

  function addSprint() {
    const start = new Date(now.getTime() + 86_400_000).toISOString()
    const end = new Date(now.getTime() + 15 * 86_400_000).toISOString()
    createSprint(`Sprint ${sprints.length + 1}`, start, end)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={addSprint}>
          <PlusIcon aria-hidden />
          Create sprint
        </Button>
        <CreateIssueDialog
          defaultSprintId={null}
          trigger={
            <Button size="sm">
              <PlusIcon aria-hidden />
              New issue
            </Button>
          }
        />
      </div>

      {current && (
        <Section
          title={current.name}
          meta={
            <>
              <span className="text-caption text-muted-foreground">
                {formatDay(current.startDate)} – {formatDay(current.endDate)}
              </span>
              <span className="text-micro bg-success/10 text-success rounded-full px-1.5 py-0.5 font-medium">
                Active
              </span>
            </>
          }
          actions={
            <>
              <span className="text-caption text-muted-foreground hidden items-center gap-2 sm:flex">
                <Progress value={progress.pct} className="w-24" />
                {progress.done}/{progress.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => completeSprint(current.id)}
              >
                Complete sprint
              </Button>
            </>
          }
        >
          {currentIssues.length === 0 ? (
            <EmptyRow>Nothing in this sprint yet.</EmptyRow>
          ) : (
            currentIssues.map((i) => (
              <IssueRow key={i.key} issue={i} onOpen={onOpenIssue} />
            ))
          )}
        </Section>
      )}

      {planned.map((sprint) => {
        const sprintIssues = issuesInSprint(issues, sprint.id)
        return (
          <Section
            key={sprint.id}
            title={sprint.name}
            defaultOpen={false}
            meta={
              <span className="text-caption text-muted-foreground">
                {formatDay(sprint.startDate)} – {formatDay(sprint.endDate)} ·{" "}
                {sprintIssues.length}{" "}
                {sprintIssues.length === 1 ? "issue" : "issues"}
              </span>
            }
            actions={
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(current)}
                title={
                  current
                    ? `Complete ${current.name} before starting another sprint`
                    : undefined
                }
                onClick={() => startSprint(sprint.id)}
              >
                Start sprint
              </Button>
            }
          >
            {sprintIssues.length === 0 ? (
              <EmptyRow>Nothing planned yet.</EmptyRow>
            ) : (
              sprintIssues.map((i) => (
                <IssueRow key={i.key} issue={i} onOpen={onOpenIssue} />
              ))
            )}
          </Section>
        )
      })}

      <Section
        title="Backlog"
        meta={
          <span className="text-caption text-muted-foreground">
            {backlog.length} {backlog.length === 1 ? "issue" : "issues"}
          </span>
        }
      >
        {backlog.length === 0 ? (
          <EmptyRow>The backlog is empty.</EmptyRow>
        ) : (
          backlog.map((i) => (
            <IssueRow key={i.key} issue={i} onOpen={onOpenIssue} />
          ))
        )}
      </Section>
    </div>
  )
}
