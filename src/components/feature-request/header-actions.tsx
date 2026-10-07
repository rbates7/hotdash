"use client"

import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"
import { NewIdeaDialog } from "@/components/feature-request/idea-dialog"
import { PersistenceNote } from "@/components/feature-request/persistence-note"
import { SAMPLE_DATA_LABEL } from "@/components/feature-request/sample-data"

/**
 * Right side of the page header: where edits live, the mock's dashed badge
 * (worded "Sample data", and gone once no sample card remains), and the one
 * way to add an idea.
 */
export function HeaderActions() {
  const { requests, persisted } = useFeatureRequests()
  const hasSample = persisted && requests.some((r) => r.sample)

  return (
    <div className="flex items-center gap-2.5">
      <PersistenceNote />
      {hasSample && (
        <span
          data-testid="sample-data-badge"
          className="text-muted-foreground border-surface-border bg-surface rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase"
        >
          {SAMPLE_DATA_LABEL}
        </span>
      )}
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
