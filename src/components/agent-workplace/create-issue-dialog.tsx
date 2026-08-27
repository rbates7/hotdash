"use client"

import * as React from "react"
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FolderIcon,
  MaximizeIcon,
  PaperclipIcon,
  TagIcon,
  XIcon,
} from "lucide-react"

import {
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  STATUS_ORDER,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { useIssues } from "@/components/agent-workplace/issues-store"

const PRIORITIES: IssuePriority[] = ["urgent", "high", "medium", "low", "none"]

function Pill({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "border-border text-body text-foreground hover:bg-muted",
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function CreateIssueDialog({
  trigger,
  defaultSprintId,
}: {
  trigger: React.ReactNode
  /** Board opens tickets straight into the sprint; Backlog leaves them out. */
  defaultSprintId: string | null
}) {
  const { actors, createIssue } = useIssues()
  const [open, setOpen] = React.useState(false)
  const [createAnother, setCreateAnother] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [status, setStatus] = React.useState<IssueStatus>("todo")
  const [priority, setPriority] = React.useState<IssuePriority>("none")
  const [assigneeId, setAssigneeId] = React.useState<string | null>(null)

  const titleRef = React.useRef<HTMLInputElement>(null)

  function reset() {
    setTitle("")
    setDescription("")
    setStatus("todo")
    setPriority("none")
    setAssigneeId(null)
  }

  function submit() {
    if (!title.trim()) return
    createIssue({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      assigneeId,
      sprintId: defaultSprintId,
      labels: [],
    })
    reset()
    if (createAnother) titleRef.current?.focus()
    else setOpen(false)
  }

  const statusConfig = STATUS_CONFIG[status]
  const priorityConfig = PRIORITY_CONFIG[priority]
  const assignee = actors.find((a) => a.id === assigneeId) ?? null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent
        showCloseButton={false}
        // Nova's .cn-dialog-content pins sm:max-w-sm, so the override has to be
        // scoped to the same breakpoint and marked important to win.
        className="bg-surface w-full sm:max-w-2xl! overflow-hidden rounded-xl border p-0! gap-0! shadow-lg"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            submit()
          }
        }}
      >
        <div className="flex items-center gap-1.5 px-4 pt-4">
          <span className="text-caption text-muted-foreground">CHLK</span>
          <ChevronRightIcon
            className="text-faint-foreground size-3.5"
            aria-hidden
          />
          <DialogTitle className="text-caption font-medium">
            Create manually
          </DialogTitle>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Expand">
              <MaximizeIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <XIcon />
            </Button>
          </div>
        </div>

        <DialogDescription className="sr-only">
          File a new issue in the CHLK workspace.
        </DialogDescription>

        <div className="flex flex-col gap-3 px-4 pt-3">
          <input
            ref={titleRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            aria-label="Issue title"
            className="text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            aria-label="Description"
            rows={8}
            className="text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <Popover>
            <PopoverTrigger
              render={
                <Pill>
                  <statusConfig.icon
                    className={cn("size-3.5", statusConfig.iconColor)}
                  />
                  {statusConfig.label}
                </Pill>
              }
            />
            <PopoverContent className="w-44 p-1">
              {STATUS_ORDER.map((s) => {
                const c = STATUS_CONFIG[s]
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <c.icon className={cn("size-3.5", c.iconColor)} />
                    {c.label}
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger
              render={
                <Pill>
                  <priorityConfig.icon
                    className={cn("size-3.5", priorityConfig.color)}
                  />
                  {priorityConfig.label}
                </Pill>
              }
            />
            <PopoverContent className="w-44 p-1">
              {PRIORITIES.map((p) => {
                const c = PRIORITY_CONFIG[p]
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <c.icon className={cn("size-3.5", c.color)} />
                    {c.label}
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger
              render={
                <Pill>
                  {assignee ? (
                    <>
                      <ActorAvatar actor={assignee} size="sm" />
                      {assignee.name}
                    </>
                  ) : (
                    "Unassigned"
                  )}
                </Pill>
              }
            />
            <PopoverContent className="w-52 p-1">
              <button
                type="button"
                onClick={() => setAssigneeId(null)}
                className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
              >
                <ActorAvatar actor={null} size="sm" />
                Unassigned
              </button>
              {actors.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAssigneeId(a.id)}
                  className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <ActorAvatar actor={a} size="sm" />
                  {a.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Pill>
            <TagIcon className="text-muted-foreground size-3.5" />
            Add label
          </Pill>
          <Pill>
            <FolderIcon className="text-muted-foreground size-3.5" />
            No project
          </Pill>
          <Pill aria-label="More options">
            <EllipsisIcon className="text-muted-foreground size-3.5" />
          </Pill>
        </div>

        <div className="border-border flex items-center gap-3 border-t px-4 py-3">
          <Button variant="ghost" size="icon-sm" aria-label="Attach a file">
            <PaperclipIcon />
          </Button>

          <div className="ml-auto flex items-center gap-3">
            {/* Renders for design fidelity. The spec describes agent assignment
                as picking an agent in the normal assignee field, and never says
                what a separate agent mode would do — so this stays inert rather
                than inventing a second creation flow. */}
            <Button variant="ghost" size="sm" disabled title="Not in this pass">
              <ArrowLeftRightIcon className="text-brand" />
              Switch to Agent
            </Button>

            <label className="text-body flex items-center gap-2">
              <Switch
                checked={createAnother}
                onCheckedChange={(checked) => setCreateAnother(Boolean(checked))}
              />
              Create another
            </label>

            <Button size="sm" onClick={submit} disabled={!title.trim()}>
              Create Issue
              <kbd className="text-micro bg-background/20 ml-1 rounded px-1">
                ⌘↵
              </kbd>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
