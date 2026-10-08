"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon, NotebookPenIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { formatRelative, type IsoDay } from "@/lib/clock"
import {
  carryFromLabel,
  carryFromSpoken,
  describeTodo,
  formatDeskDate,
  isSeedTodo,
  openCount,
  TODO_LIMITS,
  todaysTodos,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { TodoDialog } from "@/components/my-desk/todo-dialog"
import { saveState, useMyDesk } from "@/components/my-desk/my-desk-store"
import {
  DESK_ACTION,
  DESK_ACTIONS,
  DESK_ADD,
  DESK_ADD_INLINE,
  DESK_CHECK,
  DESK_DELETE_TEXT,
  DESK_DIALOG,
  DESK_FOOTER,
  DESK_HEADER,
  DESK_HEADER_ACTIONS,
  DESK_HEADER_PAD,
  DESK_HEADER_TITLE,
  DESK_OPEN,
  DESK_PANES,
  DESK_RESET,
  DESK_ROW,
  DESK_ROW_BODY,
  DESK_SCRATCH,
  DESK_SHEET_ACTION,
  DESK_SHEET_CLOSE,
  DESK_UNDO,
} from "@/components/my-desk/responsive"

export const LEDE = "Personal — not the agent board"
export const TODAY_FOOTER = "Personal list. Not Issues. Not agent work."
export const NOTES_FOOTER = "One note. Scratchpad — not a docs product."
export const SCRATCH_HINT = "jot, not an editor"
export const SCRATCH_SAVE_MS = 300
export const EMPTY_COPY =
  "Every to-do has been removed. Add one, or Reset to bring the sample rows back."
export const FINISHED_EARLIER_COPY =
  "Nothing open today. To-dos you finished on earlier days drop off this list. Add one, or Reset to bring the sample rows back."

/**
 * Stands in for both cards until localStorage has been read. Showing the
 * seed here would flash rows the founder may have deleted.
 */
function ScreenSkeleton() {
  return (
    <div role="status" aria-label="Loading saved desk" className={DESK_PANES}>
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
  finalFocus,
}: {
  target: Target<object> | null
  onOpenChange: (open: boolean) => void
  onConfirm: (todo: Todo) => void
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  const todo = target?.todo ?? null
  return (
    <Dialog open={target?.open ?? false} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-sm! ${DESK_DIALOG}`} finalFocus={finalFocus}>
        <DialogHeader className={DESK_HEADER_PAD}>
          <DialogTitle>Delete this to-do?</DialogTitle>
          <DialogDescription className="min-w-0 [overflow-wrap:anywhere]">
            {todo ? describeTodo(todo) : ""} comes off the list. There is no server copy to recover
            it from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className={DESK_FOOTER} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            className={`${DESK_FOOTER} ${DESK_DELETE_TEXT}`}
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

/**
 * Base UI wraps Tab at the sheet's ends through a focus guard and a
 * requestAnimationFrame, so for a frame focus sits outside the sheet. Wrap
 * synchronously instead: Tab on the last control goes to the first, Shift+Tab
 * on the first goes to the last.
 */
function wrapTab(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return
  const tabbable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"
    )
  ).filter((el) => el.getClientRects().length > 0)
  if (tabbable.length === 0) return
  const first = tabbable[0]
  const last = tabbable[tabbable.length - 1]
  const target = event.shiftKey
    ? document.activeElement === first && last
    : document.activeElement === last && first
  if (!target) return
  event.preventDefault()
  target.focus()
}

type SheetAction = "edit" | "delete"

function useDeferredAction() {
  const [action, setAction] = React.useState<SheetAction | null>(null)
  const queued = React.useRef<SheetAction | null>(null)
  return {
    action,
    queue: (next: SheetAction) => {
      queued.current = next
    },
    flush: () => {
      if (queued.current) setAction(queued.current)
      queued.current = null
    },
    clear: () => setAction(null),
  }
}

function TodoSheet({
  todo: current,
  today,
  open,
  onOpenChange,
  returnFocus,
  afterDelete,
  onToggle,
  onConfirmDelete,
}: {
  todo: Todo | undefined
  today: IsoDay
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: React.RefObject<HTMLElement | null>
  afterDelete: () => HTMLElement | null
  onToggle: (todo: Todo) => void
  onConfirmDelete: (todo: Todo) => void
}) {
  const { action, queue, flush, clear } = useDeferredAction()
  const [shown, setShown] = React.useState(current)
  if (current && current !== shown) setShown(current)
  const todo = current ?? shown
  if (!todo) return null
  const carryFrom = carryFromLabel(todo.createdOn, today)
  const carrySpoken = carryFromSpoken(todo.createdOn, today)
  const pick = (next: SheetAction) => () => {
    queue(next)
    onOpenChange(false)
  }
  const backToCard = () => {
    const card = returnFocus.current
    return card?.isConnected ? card : (afterDelete() ?? true)
  }
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={(next) => {
          if (!next) flush()
        }}
      >
        <SheetContent
          side="bottom"
          finalFocus={backToCard}
          onKeyDown={wrapTab}
          className={cn(
            "max-h-[90dvh] gap-3 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]",
            DESK_SHEET_CLOSE
          )}
        >
          <div aria-hidden className="bg-muted-foreground/30 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />
          <SheetHeader className="gap-1 px-4 pt-0 pb-0 max-xl:pr-14">
            <SheetTitle className="text-body font-semibold tracking-tight">{todo.title}</SheetTitle>
            <SheetDescription
              className={
                todo.note
                  ? "text-caption text-muted-foreground min-w-0 [overflow-wrap:anywhere]"
                  : "sr-only"
              }
            >
              {todo.note || "Personal to-do"}
            </SheetDescription>
            {carryFrom && carrySpoken ? (
              <p data-testid="sheet-carry-from" className="text-micro text-muted-foreground tracking-tight">
                <span aria-hidden="true">{carryFrom}</span>
                <span className="sr-only">{carrySpoken}</span>
              </p>
            ) : null}
            {isSeedTodo(todo) && <SampleDataTag className="h-5 self-start" />}
          </SheetHeader>
          <div role="group" aria-label="To-do actions" className="flex flex-col px-2 pb-2">
            <button type="button" className={DESK_SHEET_ACTION} onClick={() => onToggle(todo)}>
              <CheckIcon className="size-4" aria-hidden />
              {todo.done ? "Mark open" : "Mark done"}
            </button>
            <button type="button" className={DESK_SHEET_ACTION} onClick={pick("edit")}>
              <PencilIcon className="size-4" aria-hidden />
              Edit
            </button>
            <button type="button" className={cn(DESK_SHEET_ACTION, "text-danger-text")} onClick={pick("delete")}>
              <Trash2Icon className="size-4" aria-hidden />
              Delete
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <TodoDialog
        open={action === "edit"}
        onOpenChange={(next) => {
          if (!next) clear()
        }}
        todo={todo}
        finalFocus={backToCard}
      />
      <DeleteDialog
        target={{ todo, open: action === "delete" }}
        onOpenChange={(next) => {
          if (!next) clear()
        }}
        onConfirm={(item) => {
          onConfirmDelete(item)
          clear()
        }}
        finalFocus={backToCard}
      />
    </>
  )
}

function TodoRow({
  todo,
  today,
  onEdit,
  onDelete,
  onToggle,
  onOpen,
}: {
  todo: Todo
  today: IsoDay
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onToggle: (todo: Todo) => void
  onOpen: (todo: Todo, trigger: HTMLElement) => void
}) {
  const carryFrom = carryFromLabel(todo.createdOn, today)
  const carrySpoken = carryFromSpoken(todo.createdOn, today)
  const carryId = `${todo.id}-carry`
  return (
    <li
      data-todo={todo.id}
      data-done={todo.done ? "true" : "false"}
      className={DESK_ROW}
    >
      <div className={DESK_ROW_BODY}>
        <Button
          type="button"
          size="icon-xs"
          variant={todo.done ? "default" : "outline"}
          role="checkbox"
          aria-checked={todo.done}
          aria-label={todo.title}
          aria-describedby={carrySpoken ? carryId : undefined}
          className={cn(
            DESK_CHECK,
            todo.done
              ? "bg-foreground text-background border-foreground hover:bg-foreground hover:text-background"
              : "bg-background text-foreground border-border"
          )}
          onClick={() => onToggle(todo)}
        >
          {todo.done ? <CheckIcon className="size-2.5 max-xl:size-4" aria-hidden /> : null}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <p
              aria-hidden="true"
              className={cn(
                "min-w-0 text-[13px] leading-snug font-medium tracking-tight [overflow-wrap:anywhere]",
                todo.done ? "text-foreground line-through decoration-foreground" : "text-foreground"
              )}
            >
              {todo.title}
            </p>
            {carryFrom && carrySpoken ? (
              <span
                id={carryId}
                data-testid="carry-from"
                className="text-micro text-muted-foreground tracking-tight"
              >
                <span aria-hidden="true">{carryFrom}</span>
                <span className="sr-only">{carrySpoken}</span>
              </span>
            ) : null}
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Open ${todo.title}`}
          data-todo-open={todo.id}
          className={DESK_OPEN}
          onClick={(event) => onOpen(todo, event.currentTarget)}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
      <div className={DESK_ACTIONS}>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={`Edit ${todo.title}`}
          className={DESK_ACTION}
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
          className={cn(DESK_ACTION, DESK_DELETE_TEXT)}
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
          className={DESK_SCRATCH}
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

  const visible = todaysTodos(todos, today)
  const open = openCount(visible)

  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const pendingFocus = React.useRef<string | "heading" | null>(null)
  const fromSheet = React.useRef(false)

  const [sheetId, setSheetId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const lastOpen = React.useRef<HTMLElement | null>(null)
  const lastOpenIndex = React.useRef(0)

  const afterDelete = () => {
    const list = listRef.current
    if (!list) return titleRef.current
    const remaining = Array.from(list.querySelectorAll<HTMLElement>("[data-todo-open]"))
    return remaining[Math.min(lastOpenIndex.current, remaining.length - 1)] ?? titleRef.current
  }

  const dialogFinalFocus = () => {
    if (!fromSheet.current) return true
    const card = lastOpen.current
    return card?.isConnected ? card : (afterDelete() ?? true)
  }

  React.useLayoutEffect(() => {
    if (!pendingFocus.current || !persisted) return
    const pending = pendingFocus.current
    pendingFocus.current = null
    const el =
      pending === "heading"
        ? titleRef.current
        : document.querySelector<HTMLElement>(`[data-todo="${pending}"] [role="checkbox"]`)
    el?.focus()
  }, [todos, persisted])

  function rememberNeighbor(todo: Todo) {
    const idx = visible.findIndex((t) => t.id === todo.id)
    const next = visible[idx + 1] ?? visible[idx - 1]
    pendingFocus.current = next ? next.id : "heading"
  }

  function confirmDelete(todo: Todo) {
    if (!fromSheet.current) rememberNeighbor(todo)
    removeTodo(todo.id)
    setRemoved(todo)
    setDeleting((t) => (t ? { ...t, open: false } : t))
    if (sheetId === todo.id) {
      setSheetOpen(false)
      setSheetId(null)
    }
    fromSheet.current = false
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      <header className={DESK_HEADER}>
        <div className={DESK_HEADER_TITLE}>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-display-sm font-semibold tracking-tight outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            My Desk
          </h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">{LEDE}</p>
        </div>
        <div className={DESK_HEADER_ACTIONS}>
          <PersistenceNote store={store} resetClassName={DESK_RESET} />
          <SampleDataTag className="h-6 px-2" />
          <Button size="sm" className={DESK_ADD} onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden />
            Add to-do
          </Button>
        </div>
      </header>

      {!persisted ? (
        <ScreenSkeleton />
      ) : (
        <div className={DESK_PANES}>
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
            <CardContent className="min-h-0 flex-1 px-2 pt-1 max-xl:overflow-x-hidden">
              {visible.length === 0 ? (
                <div
                  role="status"
                  aria-label="No to-dos"
                  className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center"
                >
                  <NotebookPenIcon className="text-foreground size-6" aria-hidden />
                  <p className="text-body text-foreground font-medium">Nothing on the list</p>
                  <p className="text-caption text-muted-foreground">
                    {todos.length === 0 ? EMPTY_COPY : FINISHED_EARLIER_COPY}
                  </p>
                  <Button size="sm" variant="outline" className={cn("mt-1", DESK_ADD_INLINE)} onClick={() => setAdding(true)}>
                    <PlusIcon aria-hidden />
                    Add to-do
                  </Button>
                </div>
              ) : (
                <ul ref={listRef}>
                  {visible.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      today={today}
                      onEdit={(t) => {
                        fromSheet.current = false
                        setEditing({ todo: t, open: true })
                      }}
                      onDelete={(t) => {
                        fromSheet.current = false
                        setDeleting({ todo: t, open: true })
                      }}
                      onToggle={(t) => toggleTodo(t.id)}
                      onOpen={(t, trigger) => {
                        lastOpen.current = trigger
                        lastOpenIndex.current = Math.max(
                          0,
                          visible.findIndex((row) => row.id === t.id)
                        )
                        fromSheet.current = true
                        setSheetId(t.id)
                        setSheetOpen(true)
                      }}
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
                  className={DESK_UNDO}
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
        finalFocus={dialogFinalFocus}
      />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
        onConfirm={confirmDelete}
        finalFocus={dialogFinalFocus}
      />
      <TodoSheet
        todo={visible.find((t) => t.id === sheetId) ?? todos.find((t) => t.id === sheetId)}
        today={today}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        returnFocus={lastOpen}
        afterDelete={afterDelete}
        onToggle={(t) => toggleTodo(t.id)}
        onConfirmDelete={(item) => {
          fromSheet.current = true
          confirmDelete(item)
        }}
      />
    </div>
  )
}
