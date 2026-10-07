import { BotIcon } from "lucide-react"

import type { BoardPreview } from "@/lib/home"
import { STATUS_CONFIG } from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Door, DoorEmpty } from "@/components/home/door"

/**
 * Preview of the Agent Workplace issues board — the dev board. Column
 * counts, who is busy and how far the sprint has come, read from the same
 * store the board uses so the two can never disagree.
 */
export function DevBoardDoor({
  preview,
  loading = false,
}: {
  preview: BoardPreview | null
  /** True until the browser's saved board has been read; shows placeholders. */
  loading?: boolean
}) {
  return (
    <Door
      name="Agent Workplace"
      href="/agent-workplace"
      icon={BotIcon}
      count={
        !loading && preview && preview.working > 0
          ? `${preview.working} ${preview.working === 1 ? "agent" : "agents"} working`
          : undefined
      }
      caption={
        loading
          ? undefined
          : preview
            ? `${preview.sprint.name} · ${describeDays(preview.daysLeft)}`
            : "Sprints are planned from the Backlog tab."
      }
    >
      {loading ? (
        <div aria-busy="true" aria-label="Loading the board" className="flex flex-col gap-4">
          <Skeleton className="h-3 w-28" />
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-[66px] rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-1 w-full" />
        </div>
      ) : preview ? (
        <div className="flex flex-1 flex-col gap-4">
          <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            Dev board · {preview.sprint.name}
          </span>
          <ul
            aria-label="Columns"
            className="grid grid-cols-5 gap-1.5"
          >
            {preview.columns.map((col) => {
              const Icon = STATUS_CONFIG[col.status].icon
              return (
                <li
                  key={col.status}
                  className={cn(
                    "flex min-w-0 flex-col items-start gap-1.5 rounded-lg px-2 py-2",
                    STATUS_CONFIG[col.status].columnBg
                  )}
                >
                  <Icon
                    className={cn("size-3.5", STATUS_CONFIG[col.status].iconColor)}
                    aria-hidden
                  />
                  <span className="text-title leading-none font-semibold tracking-tight tabular-nums">
                    {col.count}
                  </span>
                  <span className="text-micro text-muted-foreground truncate leading-tight font-medium">
                    {col.label}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="text-caption text-muted-foreground flex items-center gap-2 tracking-tight">
            <Progress
              value={preview.progress.pct}
              aria-label="Sprint progress"
              className="flex-1"
            />
            <span className="tabular-nums">
              {preview.progress.done}/{preview.progress.total} done
            </span>
          </div>
        </div>
      ) : (
        <DoorEmpty
          title="No sprint is running"
          hint="Start one and the board shows up here."
        />
      )}
    </Door>
  )
}

function describeDays(days: number) {
  if (days < 0) return `${-days} ${-days === 1 ? "day" : "days"} over`
  if (days === 0) return "ends today"
  return `${days} ${days === 1 ? "day" : "days"} left`
}
