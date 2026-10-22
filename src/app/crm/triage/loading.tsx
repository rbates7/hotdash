import { Skeleton } from "@/components/ui/skeleton"

export default function TriageLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
