"use client"

import * as React from "react"
import { PlusIcon, PresentationIcon } from "lucide-react"

import { describeClinic, splitClinics, type Attendance, type Clinic } from "@/lib/clinics"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { ClinicDialog, type DialogFocus } from "@/components/clinics/clinic-dialog"
import { useClinics } from "@/components/clinics/clinics-store"
import { ClinicsSection, type RowActions } from "@/components/clinics/clinics-section"

export const LEDE = "Where the founder talks CHLK"

/**
 * Stands in for both tables until localStorage has been read. Showing the
 * seed here would flash rows the founder may have deleted.
 */
function ScreenSkeleton() {
  return (
    <div role="status" aria-label="Loading saved clinics" className="flex flex-col gap-[22px]">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-[292px] w-full rounded-xl" />
        </div>
      ))}
    </div>
  )
}

/**
 * A dialog target that outlives its own close: `open` flips off while the
 * clinic stays, so the copy does not blank out mid-fade and the edit
 * dialog never flips to "Add" on the way out.
 */
type Target<T> = { clinic: Clinic; open: boolean } & T

function DeleteDialog({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: Target<object> | null
  onOpenChange: (open: boolean) => void
  onConfirm: (clinic: Clinic) => void
}) {
  const clinic = target?.clinic ?? null
  return (
    <Dialog open={target?.open ?? false} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm!">
        <DialogHeader>
          <DialogTitle>Delete this clinic?</DialogTitle>
          <DialogDescription>
            {clinic ? describeClinic(clinic) : ""} comes off the list. There is no server copy to
            recover it from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (clinic) onConfirm(clinic)
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
 * The page: header, then Upcoming and Past as the mock stacks them. Must
 * sit inside a ClinicsProvider.
 */
export function ClinicsScreen() {
  const store = useClinics()
  const { today, clinics, persisted, setAttendance, removeClinic } = store
  const { upcoming, past } = React.useMemo(() => splitClinics(clinics, today), [clinics, today])

  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<Target<{ focus: DialogFocus }> | null>(null)
  const [deleting, setDeleting] = React.useState<Target<object> | null>(null)

  const actions = React.useMemo<RowActions>(
    () => ({
      onEdit: (clinic, focus) => setEditing({ clinic, focus, open: true }),
      onDelete: (clinic) => setDeleting({ clinic, open: true }),
      onAttendance: (clinic: Clinic, attendance: Attendance) => setAttendance(clinic.id, attendance),
    }),
    [setAttendance]
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">Clinics</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">{LEDE}</p>
        </div>
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2.5">
          <PersistenceNote store={store} />
          <SampleDataTag className="h-6 px-2" />
          <Button size="sm" className="h-9 px-3.5" onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden />
            Add clinic
          </Button>
        </div>
      </header>

      {!persisted ? (
        <ScreenSkeleton />
      ) : clinics.length === 0 ? (
        <div
          role="status"
          aria-label="No clinics"
          className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
        >
          <PresentationIcon className="text-faint-foreground size-6" aria-hidden />
          <p className="text-body text-foreground font-medium">No clinics on the calendar</p>
          <p className="text-caption">
            Every row has been removed. Add a clinic, or Reset to bring the sample rows back.
          </p>
          <Button size="sm" variant="outline" className="mt-1" onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden />
            Add clinic
          </Button>
        </div>
      ) : (
        <>
          <ClinicsSection
            title="Upcoming"
            rows={upcoming}
            today={today}
            emptyText="Nothing on the calendar. Add a clinic above."
            actions={actions}
          />
          <ClinicsSection
            title="Past"
            rows={past}
            today={today}
            emptyText="Nothing has happened yet."
            actions={actions}
          />
        </>
      )}

      <ClinicDialog open={adding} onOpenChange={setAdding} clinic={null} />
      <ClinicDialog
        open={editing?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setEditing((t) => (t ? { ...t, open: false } : t))
        }}
        clinic={editing?.clinic ?? null}
        focus={editing?.focus}
      />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
        onConfirm={(clinic) => {
          removeClinic(clinic.id)
          setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
      />
    </div>
  )
}
