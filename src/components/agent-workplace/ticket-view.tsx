"use client"

import * as React from "react"
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  EllipsisIcon,
  FolderIcon,
  PaperclipIcon,
  PanelRightIcon,
  PinIcon,
  PlusIcon,
  SmilePlusIcon,
} from "lucide-react"

import {
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  STATUS_ORDER,
  actorById,
  formatDay,
  formatRelative,
} from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { useIssues } from "@/components/agent-workplace/issues-store"

function RailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen className="flex flex-col gap-2">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="text-body hover:text-foreground text-foreground flex items-center gap-1 font-medium"
          />
        }
      >
        {title}
        <ChevronDownIcon className="text-muted-foreground size-4" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function RailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span className="text-caption text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function TicketView({
  issueKey,
  onClose,
}: {
  issueKey: string
  onClose: () => void
}) {
  const { issues, sprints, actors, now, patchIssue, addComment } = useIssues()
  const [draft, setDraft] = React.useState("")
  const [railOpen, setRailOpen] = React.useState(true)

  const issue = issues.find((i) => i.key === issueKey)

  if (!issue) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-body font-medium">Issue {issueKey} not found</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeftIcon aria-hidden />
          Back to the board
        </Button>
      </div>
    )
  }

  const status = STATUS_CONFIG[issue.status]
  const priority = PRIORITY_CONFIG[issue.priority]
  const assignee = actorById(actors, issue.assigneeId)
  const author = actorById(actors, issue.createdById)
  const sprint = sprints.find((s) => s.id === issue.sprintId) ?? null

  function send() {
    if (!draft.trim()) return
    addComment(issue!.key, draft.trim())
    setDraft("")
  }

  return (
    <div className="flex min-h-[70vh] gap-0">
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-2 pb-4">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Back to the board"
          >
            <ArrowLeftIcon />
          </Button>
          <span className="text-body min-w-0 truncate">
            <span className="text-muted-foreground font-mono">{issue.key}</span>{" "}
            {issue.title}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Pin issue">
              <PinIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <EllipsisIcon />
            </Button>
            <Button
              variant={railOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Toggle properties panel"
              aria-pressed={railOpen}
              onClick={() => setRailOpen((v) => !v)}
            >
              <PanelRightIcon />
            </Button>
          </div>
        </header>

        <div className="max-w-3xl pr-6">
          <h1 className="text-display-sm font-semibold">{issue.title}</h1>

          {issue.description ? (
            <p className="text-body-lg mt-3">{issue.description}</p>
          ) : (
            <p className="text-body-lg text-muted-foreground mt-3">
              Add description…
            </p>
          )}

          {issue.blockerReason && (
            <p className="text-body text-destructive bg-destructive/10 mt-3 rounded-lg px-3 py-2">
              {issue.blockerReason}
            </p>
          )}

          <div className="text-muted-foreground mt-3 flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Add reaction">
              <SmilePlusIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Attach a file">
              <PaperclipIcon />
            </Button>
          </div>

          <button
            type="button"
            className="text-body text-muted-foreground hover:text-foreground mt-6 flex items-center gap-1.5"
          >
            <PlusIcon className="size-4" aria-hidden />
            Add sub-issues
          </button>

          <hr className="border-border my-6" />

          <div className="flex items-center gap-2">
            <h2 className="text-title-sm font-semibold">Activity</h2>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="text-caption text-muted-foreground hover:text-foreground"
              >
                Unsubscribe
              </button>
              <ActorAvatar actor={author} size="sm" />
            </div>
          </div>

          <Collapsible defaultOpen className="mt-3">
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="text-caption text-muted-foreground hover:text-foreground flex items-center gap-1"
                />
              }
            >
              <ChevronDownIcon className="size-4" aria-hidden />
              {issue.activity.length}{" "}
              {issue.activity.length === 1 ? "activity" : "activities"}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 flex flex-col gap-2.5">
                {issue.activity.map((entry) => {
                  const actor = actorById(actors, entry.actorId)
                  return (
                    <li key={entry.id} className="flex items-center gap-2">
                      <ActorAvatar actor={actor} size="sm" />
                      <span className="text-body">
                        <span className="font-medium">
                          {actor?.name ?? "Someone"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {entry.verb}
                        </span>
                      </span>
                      <span className="text-caption text-faint-foreground ml-auto">
                        {formatRelative(entry.at, now)}
                      </span>
                    </li>
                  )
                })}
                {issue.comments.map((comment) => {
                  const actor = actorById(actors, comment.actorId)
                  return (
                    <li key={comment.id} className="flex items-start gap-2">
                      <ActorAvatar actor={actor} size="sm" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-body">
                          <span className="font-medium">
                            {actor?.name ?? "Someone"}
                          </span>{" "}
                          <span className="text-caption text-faint-foreground">
                            {formatRelative(comment.at, now)}
                          </span>
                        </p>
                        <p className="text-body mt-0.5">{comment.body}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>

          <div className="border-border bg-surface mt-4 rounded-lg border p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault()
                  send()
                }
              }}
              rows={3}
              placeholder="Leave a comment..."
              aria-label="Leave a comment"
              className="text-body placeholder:text-muted-foreground w-full resize-none bg-transparent px-1 py-1 outline-none"
            />
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Attach a file">
                <PaperclipIcon />
              </Button>
              <Button
                size="icon-sm"
                className="rounded-full"
                aria-label="Send comment"
                onClick={send}
                disabled={!draft.trim()}
              >
                <ArrowUpIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {railOpen && (
        <aside className="border-border w-72 shrink-0 border-l pt-14 pl-6">
          <div className="flex flex-col gap-6">
            <RailSection title="Properties">
              <RailRow label="Status">
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="text-body hover:bg-muted -ml-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
                      >
                        <status.icon
                          className={cn("size-3.5", status.iconColor)}
                        />
                        {status.label}
                      </button>
                    }
                  />
                  <PopoverContent className="w-44 p-1">
                    {STATUS_ORDER.map((s) => {
                      const c = STATUS_CONFIG[s]
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => patchIssue(issue.key, { status: s })}
                          className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                        >
                          <c.icon className={cn("size-3.5", c.iconColor)} />
                          {c.label}
                        </button>
                      )
                    })}
                  </PopoverContent>
                </Popover>
              </RailRow>

              <RailRow label="Priority">
                <span className="text-body flex items-center gap-1.5">
                  <priority.icon className={cn("size-3.5", priority.color)} />
                  {priority.label}
                </span>
              </RailRow>

              <RailRow label="Assignee">
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="text-body hover:bg-muted -ml-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
                      >
                        <ActorAvatar actor={assignee} size="sm" showPresence />
                        {assignee?.name ?? "Unassigned"}
                      </button>
                    }
                  />
                  <PopoverContent className="w-52 p-1">
                    <button
                      type="button"
                      onClick={() =>
                        patchIssue(issue.key, { assigneeId: null })
                      }
                      className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                    >
                      <ActorAvatar actor={null} size="sm" />
                      Unassigned
                    </button>
                    {actors.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() =>
                          patchIssue(issue.key, { assigneeId: a.id })
                        }
                        className="text-body hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                      >
                        <ActorAvatar actor={a} size="sm" />
                        {a.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </RailRow>

              <RailRow label="Sprint">
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="text-body hover:bg-muted -ml-1.5 rounded-md px-1.5 py-0.5 text-left"
                      >
                        {sprint?.name ?? "Backlog"}
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
                    {sprints
                      .filter((s) => s.status !== "completed")
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            patchIssue(issue.key, { sprintId: s.id })
                          }
                          className="text-body hover:bg-muted w-full rounded-md px-2 py-1.5 text-left"
                        >
                          {s.name}
                        </button>
                      ))}
                  </PopoverContent>
                </Popover>
              </RailRow>

              <RailRow label="Project">
                <span className="text-body text-muted-foreground flex items-center gap-1.5">
                  <FolderIcon className="size-3.5" aria-hidden />
                  No project
                </span>
              </RailRow>

              <button
                type="button"
                className="text-body text-muted-foreground hover:text-foreground -ml-0.5 flex items-center gap-1.5"
              >
                <PlusIcon className="size-4" aria-hidden />
                Add property
              </button>
            </RailSection>

            <RailSection title="Pull requests">
              <p className="text-caption text-muted-foreground leading-relaxed">
                No linked pull requests yet. Reference this issue&apos;s
                identifier in a PR&apos;s branch name, title, or body to
                auto-link it.
              </p>
            </RailSection>

            <RailSection title="Details">
              <RailRow label="Created by">
                <span className="text-body flex items-center gap-1.5">
                  <ActorAvatar actor={author} size="sm" />
                  {author?.name ?? "Unknown"}
                </span>
              </RailRow>
              <RailRow label="Created">
                <span className="text-body">{formatDay(issue.createdAt)}</span>
              </RailRow>
              <RailRow label="Updated">
                <span className="text-body">{formatDay(issue.updatedAt)}</span>
              </RailRow>
            </RailSection>
          </div>
        </aside>
      )}
    </div>
  )
}
