import { Skeleton } from "@/components/ui/skeleton"

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

export function CrmTableSkeleton({ label = "Loading saved CRM" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <Skeleton className="h-[320px] w-full rounded-xl" />
    </div>
  )
}
