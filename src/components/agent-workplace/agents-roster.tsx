"use client"

import { agents, currentTask } from "@/lib/issues"
import { cn } from "@/lib/utils"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { useIssues } from "@/components/agent-workplace/issues-store"

export function StatusPill({
  working,
  className,
}: {
  working: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-caption inline-flex h-[22px] shrink-0 items-center rounded-full px-2 font-semibold tracking-tight",
        working ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
        className
      )}
    >
      {working ? "Working" : "Idle"}
    </span>
  )
}

/**
 * Roster: name, bot avatar, Idle/Working, current task. Nothing else this
 * pass — no provider, model, uptime or cost, per the requirements doc.
 */
export function AgentsRoster({
  onOpenIssue,
}: {
  onOpenIssue: (key: string) => void
}) {
  const { issues, actors } = useIssues()

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
      {agents(actors).map((agent) => {
        const task = currentTask(issues, agent.id)
        return (
          <article
            key={agent.id}
            aria-label={agent.name}
            className="bg-surface border-surface-border flex min-h-[168px] flex-col gap-3 rounded-xl border px-[18px] pt-[18px] pb-4"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <ActorAvatar actor={agent} size="lg" />
                <h3 className="text-body-lg truncate leading-tight font-semibold tracking-tight">
                  {agent.name}
                </h3>
              </div>
              <StatusPill working={Boolean(task)} />
            </div>

            <div>
              <p className="text-micro text-muted-foreground font-semibold tracking-[0.06em] uppercase">
                Current task
              </p>
              {task ? (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenIssue(task.key)}
                    className="text-label mt-1 text-left leading-[1.4] font-semibold tracking-tight hover:underline"
                  >
                    {task.title}
                  </button>
                  <p className="text-micro text-muted-foreground mt-1 font-medium tabular-nums">
                    {task.key}
                  </p>
                </>
              ) : (
                <p className="text-label text-muted-foreground mt-1 leading-[1.4] font-medium">
                  Idle
                </p>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
