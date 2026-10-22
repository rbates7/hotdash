import { Skeleton } from "@/components/ui/skeleton"

export default function ContactsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Skeleton className="h-6 w-28" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6 flex flex-col gap-2 rounded-xl border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
