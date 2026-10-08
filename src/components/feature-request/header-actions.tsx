"use client"

import { PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"
import { NewIdeaDialog } from "@/components/feature-request/idea-dialog"
import { FR_HEADER_ACTIONS, FR_RESET, FR_TOUCH } from "@/components/feature-request/responsive"

/**
 * The one New idea control. The page renders it beside the title on phone
 * and again in Page actions from `md` up (Deke 13:1651 / 13:2075).
 */
export function NewIdeaButton({ className }: { className?: string }) {
  return (
    <NewIdeaDialog
      trigger={
        <Button size="sm" className={cn(FR_TOUCH, className)}>
          <PlusIcon />
          New idea
        </Button>
      }
    />
  )
}

/**
 * Right side of the page header: the shared persistence note (where edits
 * live, Reset behind a confirm), the shared sample-data tag in the mock's
 * badge position (gone once no sample card remains), and the one way to
 * add an idea (hidden on phone; the title row carries it there).
 */
export function HeaderActions({
  className,
  newIdeaClassName,
}: {
  className?: string
  newIdeaClassName?: string
}) {
  const store = useFeatureRequests()
  const hasSample = store.persisted && store.requests.some((r) => r.sample)

  return (
    <div
      role="group"
      aria-label="Page actions"
      className={cn(FR_HEADER_ACTIONS, className)}
    >
      <PersistenceNote store={store} resetClassName={FR_RESET} />
      {hasSample && <SampleDataTag className="h-6 px-2" />}
      <NewIdeaButton className={cn(newIdeaClassName)} />
    </div>
  )
}
