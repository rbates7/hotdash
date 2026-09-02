import { PhoneIcon, StickyNoteIcon } from "lucide-react"

import { NoteDeleteButton } from "@/components/crm/note-delete-button"
import { formatDateTime, relativeTime } from "@/lib/crm/format"

/** Notes and logged calls about a person, newest first. */
export function ContactTimeline({
  notes,
}: {
  notes: { id: string; kind: string; body: string; createdAt: Date }[]
}) {
  if (notes.length === 0) {
    return (
      <p className="text-muted-foreground text-caption rounded-xl border border-dashed px-4 py-6 text-center">
        Nothing noted yet. What you write here stays with the person, not
        with any one case.
      </p>
    )
  }
  return (
    <ol className="flex flex-col gap-2">
      {notes.map((note) => {
        const isCall = note.kind === "call"
        return (
          <li
            key={note.id}
            className="bg-card flex items-start gap-3 rounded-xl border px-3.5 py-3"
          >
            <span
              className="bg-warning/20 text-warning mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
              aria-hidden
            >
              {isCall ? (
                <PhoneIcon className="size-3" />
              ) : (
                <StickyNoteIcon className="size-3" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body whitespace-pre-wrap">{note.body}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {isCall ? "Call" : "Note"} ·{" "}
                <span title={formatDateTime(note.createdAt)}>
                  {relativeTime(note.createdAt)}
                </span>
              </p>
            </div>
            <NoteDeleteButton noteId={note.id} />
          </li>
        )
      })}
    </ol>
  )
}
