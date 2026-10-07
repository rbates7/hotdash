"use client"

import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"
import { NewIdeaDialog } from "@/components/feature-request/idea-dialog"

/**
 * Right side of the page header: the shared persistence note (where edits
 * live, Reset behind a confirm), the shared sample-data tag in the mock's
 * badge position (gone once no sample card remains), and the one way to
 * add an idea.
 */
export function HeaderActions() {
  const store = useFeatureRequests()
  const hasSample = store.persisted && store.requests.some((r) => r.sample)

  return (
    <div role="group" aria-label="Page actions" className="flex items-center gap-2.5">
      <PersistenceNote store={store} />
      {hasSample && <SampleDataTag className="h-6 px-2" />}
      <NewIdeaDialog
        trigger={
          <Button size="sm">
            <PlusIcon />
            New idea
          </Button>
        }
      />
    </div>
  )
}
