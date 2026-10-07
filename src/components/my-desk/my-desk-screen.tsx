"use client"

import * as React from "react"
import { CheckIcon, NotebookPenIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { formatRelative } from "@/lib/clock"
import {
  describeTodo,
  formatDeskDate,
  isSeedTodo,
  openCount,
  TODO_LIMITS,
  type Todo,
} from "@/lib/my-desk"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { TodoDialog } from "@/components/my-desk/todo-dialog"
import { saveState, useMyDesk } from "@/components/my-desk/my-desk-store"

export const LEDE = "Personal — not the agent board"
export const TODAY_FOOTER = "Personal list. Not Issues. Not agent work."
export const NOTES_FOOTER = "One note. Scratchpad — not a docs product."
export const SCRATCH_HINT = "jot, not an editor"
export const SCRATCH_SAVE_MS = 300
export const EMPTY_COPY =
  "Every to-do has been removed. Add one, or Reset to bring the sample rows back."

/**
 * Stands in for both cards until localStorage has been read. Showing the
 * seed here would flash rows the founder may have deleted.
 */
function ScreenSkeleton() {
  return (
    <div role="status" aria-label="Loading saved desk" className="grid min-h-[min(560px,calc(100svh-10rem))] grid-cols-1 gap-4 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl ring-1 ring-foreground/10 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-md" />
          </div>
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

type Target<T> = { todo: Todo; open: boolean } & T

function DeleteDialog({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: Target<object> | null
  onOpenChange: (open: boolean) => void
  onConfirm: (todo: Todo) => void
}) {
  const todo = target?.todo ?? null
  return (
    <Dialog open={target?.open ?? false} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm!">
        <DialogHeader>
          <DialogTitle>Delete this to-do?</DialogTitle>
          <DialogDescription className="min-w-0 [overflow-wrap:anywhere]">
            {todo ? describeTodo(todo) : ""} comes off the list. There is no server copy to recover
            it from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (todo) onConfirm(todo)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TodoRow({
  todo,
  onEdit,
  onDelete,
  onToggle,
}: {
  todo: Todo
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onToggle: (todo: Todo) => void
}) {
  return (
    <li
      data-todo={todo.id}
      data-done={todo.done ? "true" : "false"}
      className="flex items-start gap-3 border-t border-border px-2.5 py-3 first:border-t-0"
    >
      <Button
        type="button"
        size="icon-xs"
        variant={todo.done ? "default" : "outline"}
        role="checkbox"
        aria-checked={todo.done}
        aria-label={todo.title}
        className={cn(
          "mt-0.5 size-4 rounded-[4px] border",
          todo.done
            ? "bg-foreground text-background border-foreground hover:bg-foreground hover:text-background"
            : "bg-background text-foreground border-border"
        )}
        onClick={() => onToggle(todo)}
      >
        {todo.done ? <CheckIcon className="size-2.5" aria-hidden /> : null}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2">
          <p
            className={cn(
              "min-w-0 text-[13px] leading-snug font-medium tracking-tight [overflow-wrap:anywhere]",
              todo.done ? "text-foreground line-through decoration-foreground" : "text-foreground"
            )}
          >
            {todo.title}
          </p>
          {isSeedTodo(todo) && <SampleDataTag className="h-5" />}
        </div>
        {todo.note ? (
          <p
            className={cn(
              "text-caption mt-0.5 min-w-0 leading-snug tracking-tight [overflow-wrap:anywhere]",
              todo.done ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {todo.note}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={`Edit ${todo.title}`}
          onClick={() => onEdit(todo)}
        >
          <PencilIcon aria-hidden />
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={`Delete ${todo.title}`}
          onClick={() => onDelete(todo)}
        >
          <Trash2Icon aria-hidden />
          Delete
        </Button>
      </div>
    </li>
  )
}

function ScratchPane() {
  const store = useMyDesk()
  const { scratch, scratchUpdatedAt, scratchSample, persisted, saved, saveFailed, nowMs, today, setScratch } =
    store
  const [draft, setDraft] = React.useState(scratch)
  const [seenScratch, setSeenScratch] = React.useState(scratch)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = React.useRef(draft)
  const storeRef = React.useRef(store)

  // Store scratch is the source of truth after Reset, hydrate, or our own
  // save. Adjust during render rather than in an effect so a Reset cannot
  // flash the previous draft.
  if (scratch !== seenScratch) {
    setSeenScratch(scratch)
    setDraft(scratch)
  }

  React.useLayoutEffect(() => {
    draftRef.current = draft
    storeRef.current = store
  })

  const persistDraft = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = draftRef.current
    const { scratch: current, todos, nextId, setScratch: commit } = storeRef.current
    if (next === current) return
    const at = new Date().toISOString()
    commit(next)
    // The store write is effect-driven. A reload, close, or client
    // navigation can kill the tree before that effect runs, so the
    // draft also goes to localStorage in this same turn.
    saveState(window.localStorage, {
      todos,
      nextId,
      scratch: next,
      scratchUpdatedAt: at,
    })
  }, [])

  React.useEffect(() => {
    const onPageHide = () => persistDraft()
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistDraft()
    }
    window.addEventListener("pagehide", onPageHide)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      persistDraft()
      window.removeEventListener("pagehide", onPageHide)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [persistDraft])

  function flush(next: string) {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (next !== scratch) setScratch(next)
  }

  function onChange(value: string) {
    draftRef.current = value
    setDraft(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setScratch(value)
    }, SCRATCH_SAVE_MS)
  }

  const dirty = draft !== scratch
  const status = !persisted
    ? SCRATCH_HINT
    : dirty
      ? "Saving…"
      : saveFailed
        ? "Couldn’t save"
        : saved
          ? `Saved ${formatRelative(Date.parse(scratchUpdatedAt), nowMs)}`
          : SCRATCH_HINT

  return (
    <Card className="flex h-full min-h-[min(560px,calc(100svh-10rem))] flex-1" size="sm" role="region" aria-label="Notes">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-[13px] font-semibold tracking-tight">Notes</CardTitle>
            {scratchSample && <SampleDataTag className="h-5" />}
          </div>
          <p className="text-micro text-muted-foreground tabular-nums" data-testid="scratch-status">
            {status}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Scratch</h2>
          <p className="text-micro text-muted-foreground mt-1 tabular-nums">
            {formatDeskDate(today)} · {SCRATCH_HINT}
          </p>
        </div>
        <label htmlFor="scratch-note" className="sr-only">
          Scratch
        </label>
        <Textarea
          id="scratch-note"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => flush(draft)}
          maxLength={TODO_LIMITS.scratch}
          aria-label="Scratch"
          className="min-h-[220px] flex-1 resize-none rounded-md border-0 bg-transparent p-0 shadow-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </CardContent>
      <div className="text-micro text-muted-foreground border-t px-4 py-3">{NOTES_FOOTER}</div>
    </Card>
  )
}

/**
 * The page: header, then Today and Notes side by side as the mock stacks
 * them. Must sit inside a MyDeskProvider.
 */
export function MyDeskScreen() {
  const store = useMyDesk()
  const { today, todos, persisted, toggleTodo, removeTodo, restoreTodo } = store

  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<Target<object> | null>(null)
  const [deleting, setDeleting] = React.useState<Target<object> | null>(null)
  const [removed, setRemoved] = React.useState<Todo | null>(null)

  const open = openCount(todos)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">My Desk</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">{LEDE}</p>
        </div>
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2.5">
          <PersistenceNote store={store} />
          <SampleDataTag className="h-6 px-2" />
          <Button size="sm" className="h-9 px-3.5" onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden />
            Add to-do
          </Button>
        </div>
      </header>

      {!persisted ? (
        <ScreenSkeleton />
      ) : (
        <div className="grid min-h-[min(560px,calc(100svh-10rem))] flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
          <Card className="flex h-full min-h-[min(560px,calc(100svh-10rem))] flex-1" size="sm" role="region" aria-label="Today list">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-[13px] font-semibold tracking-tight">Today</CardTitle>
                <div className="flex items-center gap-2">
                  <p className="text-micro text-muted-foreground tabular-nums" data-testid="today-date">
                    {formatDeskDate(today)}
                  </p>
                  <Badge
                    variant="secondary"
                    data-testid="open-count"
                    aria-label={`${open} open`}
                    className="min-w-5 justify-center tabular-nums"
                  >
                    {open}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 px-2 pt-1">
              {todos.length === 0 ? (
                <div
                  role="status"
                  aria-label="No to-dos"
                  className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center"
                >
                  <NotebookPenIcon className="text-foreground size-6" aria-hidden />
                  <p className="text-body text-foreground font-medium">Nothing on the list</p>
                  <p className="text-caption text-muted-foreground">{EMPTY_COPY}</p>
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => setAdding(true)}>
                    <PlusIcon aria-hidden />
                    Add to-do
                  </Button>
                </div>
              ) : (
                <ul>
                  {todos.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onEdit={(t) => setEditing({ todo: t, open: true })}
                      onDelete={(t) => setDeleting({ todo: t, open: true })}
                      onToggle={(t) => toggleTodo(t.id)}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
            {removed ? (
              <div
                role="status"
                aria-label="To-do removed"
                className="text-caption text-foreground flex min-w-0 items-center justify-between gap-2 border-t px-4 py-2 [overflow-wrap:anywhere]"
              >
                <p className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium">{removed.title}</span> removed.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    restoreTodo(removed)
                    setRemoved(null)
                  }}
                >
                  Undo
                </Button>
              </div>
            ) : null}
            <div className="text-micro text-muted-foreground border-t px-4 py-3">{TODAY_FOOTER}</div>
          </Card>

          <ScratchPane />
        </div>
      )}

      <TodoDialog open={adding} onOpenChange={setAdding} todo={null} />
      <TodoDialog
        open={editing?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setEditing((t) => (t ? { ...t, open: false } : t))
        }}
        todo={editing?.todo ?? null}
      />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
        onConfirm={(todo) => {
          removeTodo(todo.id)
          setRemoved(todo)
          setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
      />
    </div>
  )
}
