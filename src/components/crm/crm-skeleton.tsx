import { Skeleton } from "@/components/ui/skeleton"
import { RowCollapse } from "@/components/responsive-table"

export function CrmSkeleton({ label = "Loading saved CRM" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[280px] w-full rounded-xl" />
    </div>
  )
}

/** Phone (<768, Deke 8:236): RowCollapse loading cards stand in for the table. */
export function CrmTableSkeleton({ label = "Loading saved CRM" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-xl rounded-lg max-md:hidden" />
      <Skeleton className="h-[320px] w-full rounded-xl max-md:hidden" />
      <div
        data-slot="crm-card-skeleton"
        role="list"
        className="bg-surface border-surface-border overflow-hidden rounded-xl border md:hidden [&>*:last-child>*]:border-b-0"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <RowCollapse key={i} title="" loading />
        ))}
      </div>
    </div>
  )
}
