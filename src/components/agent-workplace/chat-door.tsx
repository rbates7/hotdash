"use client"

import { ArrowRightIcon } from "lucide-react"

import { agents, currentTask } from "@/lib/issues"
import { Button } from "@/components/ui/button"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { StatusPill } from "@/components/agent-workplace/agents-roster"
import { useIssues } from "@/components/agent-workplace/issues-store"

/**
 * Chat is deliberately a door, not a room. The screens doc says agent talk
 * belongs in each bot's own chat; a Workplace thread would be a third inbox.
 * So this panel only points at the crew and never promises a thread here.
 */
export function ChatDoor({ onOpenAgents }: { onOpenAgents: () => void }) {
  const { issues, actors } = useIssues()

  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <p className="text-caption text-muted-foreground -mt-1 tracking-tight">
        Skipped for v1. Talk to an agent in its own chat — this tab is only a
        door to the crew.
      </p>

      <div className="bg-surface border-surface-border overflow-hidden rounded-xl border">
        {agents(actors).map((agent) => {
          const task = currentTask(issues, agent.id)
          return (
            <div
              key={agent.id}
              className="border-border flex items-center gap-3 border-b px-[18px] py-3.5 last:border-b-0"
            >
              <ActorAvatar actor={agent} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold tracking-tight">
                  {agent.name}
                </p>
                <p className="text-caption text-muted-foreground mt-0.5 truncate">
                  {task ? `${task.key} · ${task.title}` : "Idle"}
                </p>
              </div>
              <StatusPill working={Boolean(task)} className="hidden sm:inline-flex" />
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled
                title="Each agent's chat lives in its own tool; not wired in this pass."
              >
                Open chat
                <ArrowRightIcon aria-hidden />
              </Button>
            </div>
          )
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground w-fit"
        onClick={onOpenAgents}
      >
        See the roster
        <ArrowRightIcon aria-hidden />
      </Button>
    </div>
  )
}
