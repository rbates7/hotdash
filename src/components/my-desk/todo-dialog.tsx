"use client"

import * as React from "react"

import { TODO_LIMITS, type Todo } from "@/lib/my-desk"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useMyDesk } from "@/components/my-desk/my-desk-store"

type Draft = { title: string; note: string }

function draftFrom(todo: Todo | null): Draft {
  if (!todo) return { title: "", note: "" }
  return { title: todo.title, note: todo.note }
}

/**
 * One form for Add and Edit. The popup unmounts when closed, so the draft
 * is fresh on every open. Title is required; the note is optional.
 */
export function TodoDialog({
  open,
  onOpenChange,
  todo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` adds; a to-do edits it. */
  todo: Todo | null
}) {
  const titleRef = React.useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md!" initialFocus={titleRef}>
        <TodoForm todo={todo} onDone={() => onOpenChange(false)} titleRef={titleRef} />
      </DialogContent>
    </Dialog>
  )
}

function TodoForm({
  todo,
  onDone,
  titleRef,
}: {
  todo: Todo | null
  onDone: () => void
  titleRef: React.RefObject<HTMLInputElement | null>
}) {
  const { addTodo, updateTodo } = useMyDesk()
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(todo))
  const uid = React.useId()
  const id = (field: string) => `${uid}-${field}`

  const editing = todo !== null
  const valid = draft.title.trim().length > 0

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    const input = {
      title: draft.title,
      note: draft.note,
      done: todo?.done ?? false,
    }
    if (todo) updateTodo(todo.id, input)
    else addTodo(input)
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={editing ? "Edit to-do" : "Add to-do"}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit to-do" : "Add to-do"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Change the title or the one-line note. "
            : "A personal item for today: a title and an optional note. "}
          Saved in this browser only. Not Issues. Not agent work.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={id("title")} className="text-caption font-medium">
            Title
          </label>
          <Input
            id={id("title")}
            ref={titleRef}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            maxLength={TODO_LIMITS.title}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={id("note")} className="text-caption font-medium">
            Note
            <span className="text-muted-foreground font-normal"> (optional)</span>
          </label>
          <Textarea
            id={id("note")}
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            maxLength={TODO_LIMITS.note}
            rows={2}
            className="min-h-9"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {editing ? "Save changes" : "Add to-do"}
        </Button>
      </DialogFooter>
    </form>
  )
}
