import { Skeleton } from "@/components/ui/skeleton"

export default function CasesLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="mt-2 h-4 w-40" />
      <Skeleton className="mt-6 h-8 w-96" />
      <div className="mt-4 flex flex-col gap-2 rounded-xl border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
