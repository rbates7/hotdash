"use client"

import { PresentationIcon } from "lucide-react"

import { formatRelativeDay, type IsoDay } from "@/lib/clock"
import {
  describeInitiative,
  formatWhen,
  isSeedInitiative,
  type Initiative,
} from "@/lib/community-development"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SampleDataTag } from "@/components/sample-data"
import { StatusPill, TypePill } from "@/components/community-development/initiative-pills"
import { SPAWN_LABEL, SPAWN_SOON } from "@/components/community-development/initiative-dialog"
import {
  CD_DESTRUCTIVE,
  CD_HEADER,
  CD_TOUCH,
} from "@/components/community-development/responsive"

/** Stock × is 44×44 below 1280; the right-side sheet keeps develop's width. */
const DETAIL_SHEET =
  "flex w-full flex-col sm:max-w-md max-xl:[&>[data-slot=sheet-close]]:size-11! max-xl:[&>[data-slot=sheet-close]]:min-h-[44px]! max-xl:[&>[data-slot=sheet-close]]:min-w-[44px]!"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-micro text-muted-foreground font-medium tracking-[0.05em] uppercase">
        {label}
      </dt>
      <dd className="text-label text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Row detail. The sheet outlives its own close so the copy does not blank
 * out mid-fade: `open` flips off while the initiative stays.
 */
export function InitiativeDetail({
  target,
  today,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  target: { initiative: Initiative; open: boolean } | null
  today: IsoDay
  onOpenChange: (open: boolean) => void
  onEdit: (initiative: Initiative) => void
  onDelete: (initiative: Initiative) => void
}) {
  const row = target?.initiative ?? null
  const when = row ? formatWhen(row, today) : null
  return (
    <Sheet open={target?.open ?? false} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={DETAIL_SHEET}>
        {row && (
          <>
            <SheetHeader className={CD_HEADER}>
              <SheetTitle className="flex flex-wrap items-center gap-1.5">
                <span>{row.name}</span>
                {isSeedInitiative(row) && <SampleDataTag />}
              </SheetTitle>
              <SheetDescription>{describeInitiative(row)}</SheetDescription>
            </SheetHeader>
            <dl className="flex flex-col gap-4 px-1 py-2">
              <Field label="Type">
                <TypePill type={row.type} />
              </Field>
              <Field label="Status">
                <StatusPill status={row.status} />
              </Field>
              <Field label="Beneficiary / partner">{row.partner || "—"}</Field>
              <Field label="When">
                <div className="flex flex-col gap-0.5">
                  <span>{when?.primary}</span>
                  {row.date && (
                    <span className="text-caption text-muted-foreground">
                      {formatRelativeDay(row.date, today)}
                    </span>
                  )}
                  {when?.secondary && (
                    <span className="text-caption text-muted-foreground">{when.secondary}</span>
                  )}
                </div>
              </Field>
              <Field label="Owner">{row.owner}</Field>
              <Field label="What we gave / impact">{row.impact || "—"}</Field>
            </dl>
            <SheetFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                title={SPAWN_SOON}
                aria-description={SPAWN_SOON}
                className={CD_TOUCH}
              >
                <PresentationIcon aria-hidden />
                {SPAWN_LABEL}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className={CD_TOUCH} onClick={() => onEdit(row)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={cn(CD_TOUCH, CD_DESTRUCTIVE)}
                  onClick={() => onDelete(row)}
                >
                  Delete
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
