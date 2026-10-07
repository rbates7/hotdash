"use client"

import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  LightbulbIcon,
  PencilIcon,
  TicketIcon,
} from "lucide-react"

import { COLUMN_CONFIG, COLUMN_ORDER, type RoadmapItem } from "@/lib/roadmap/roadmap"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { SampleDataTag } from "@/components/product-roadmap/sample-data"

export const SOURCE_CHIP_TITLE =
  "Came in through the Feature Request intake. Shown for context; the two pages are not linked yet."

export const TICKETS_TITLE =
  "Linked Agent Workplace tickets. Sample count, display only — nothing is wired to the Issues board yet."

/** "3 tickets", "1 ticket", "No tickets". */
export function ticketsLabel(count: number): string {
  if (count === 0) return "No tickets"
  return `${count} ${count === 1 ? "ticket" : "tickets"}`
}

export function OwnerChip({ owner, className }: { owner: string; className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted border-surface-border text-micro text-foreground inline-flex h-5 items-center gap-1 rounded-full border pr-2 pl-0.5 font-medium whitespace-nowrap",
        className
      )}
    >
      <span
        aria-hidden
        className="bg-brand text-brand-foreground grid size-4 place-items-center rounded-full text-[9px] leading-none font-semibold"
      >
        {owner.charAt(0)}
      </span>
      {owner}
    </span>
  )
}

/**
 * One signed bet. Anatomy: title, why it matters, then owner / window /
 * source / tickets, then the sequencing controls. Every control is a real
 * button with a plain name; the card itself is a named article so lookups
 * can be scoped to it.
 */
export function RoadmapCard({
  item,
  index,
  count,
  onEdit,
}: {
  item: RoadmapItem
  /** Position within its column, 0-based. */
  index: number
  /** Cards in its column. */
  count: number
  onEdit: (id: string) => void
}) {
  const { moveItem, reorderItem } = useRoadmap()
  const columnIndex = COLUMN_ORDER.indexOf(item.column)
  const left = columnIndex > 0 ? COLUMN_ORDER[columnIndex - 1] : null
  const right = columnIndex < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[columnIndex + 1] : null

  return (
    <article
      aria-label={item.title}
      className={cn(
        "bg-surface border-surface-border flex w-full min-w-0 flex-col gap-2 rounded-xl border px-3.5 pt-3.5 pb-2.5",
        "hover:border-foreground/15 transition-colors"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h3 className="text-label min-w-0 leading-[1.35] font-semibold tracking-tight">
          {item.title}
        </h3>
        {item.sample && <SampleDataTag />}
      </div>

      {item.why && (
        <p className="text-caption text-muted-foreground leading-[1.45] tracking-tight">
          {item.why}
        </p>
      )}

      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <OwnerChip owner={item.owner} />
        {item.window && (
          <span className="text-micro text-muted-foreground inline-flex items-center gap-1 font-medium whitespace-nowrap tabular-nums">
            <CalendarIcon className="size-3" aria-hidden />
            {item.window}
          </span>
        )}
        {item.fromFeatureRequest && (
          <span
            title={SOURCE_CHIP_TITLE}
            className="bg-brand/10 text-brand dark:bg-brand/20 inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] leading-none font-semibold whitespace-nowrap"
          >
            <LightbulbIcon className="size-2.5" aria-hidden />
            From Feature Request
          </span>
        )}
        <span
          title={TICKETS_TITLE}
          className="text-micro text-muted-foreground ml-auto inline-flex items-center gap-1 font-medium whitespace-nowrap tabular-nums"
        >
          <TicketIcon className="size-3" aria-hidden />
          {ticketsLabel(item.linkedTickets)}
        </span>
      </div>

      <div className="border-surface-border mt-1 flex items-center gap-0.5 border-t pt-2">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Move up"
          title="Move up within this column"
          disabled={index === 0}
          onClick={() => reorderItem(item.id, -1)}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Move down"
          title="Move down within this column"
          disabled={index >= count - 1}
          onClick={() => reorderItem(item.id, 1)}
        >
          <ChevronDownIcon />
        </Button>
        <span className="bg-surface-border mx-1 h-4 w-px" aria-hidden />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={left ? `Move to ${COLUMN_CONFIG[left].label}` : "Already first column"}
          title={left ? `Move to ${COLUMN_CONFIG[left].label}` : "Already in the first column"}
          disabled={!left}
          onClick={() => left && moveItem(item.id, left)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={right ? `Move to ${COLUMN_CONFIG[right].label}` : "Already last column"}
          title={right ? `Move to ${COLUMN_CONFIG[right].label}` : "Already in the last column"}
          disabled={!right}
          onClick={() => right && moveItem(item.id, right)}
        >
          <ChevronRightIcon />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-micro ml-auto h-6 px-1.5"
          aria-label="Edit"
          title="Edit title, why, owner or window"
          onClick={() => onEdit(item.id)}
        >
          <PencilIcon aria-hidden />
          Edit
        </Button>
      </div>
    </article>
  )
}
