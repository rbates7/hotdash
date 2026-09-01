"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"

export function SearchInput({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [q, setQ] = React.useState(searchParams.get("q") ?? "")

  React.useEffect(() => {
    const current = searchParams.get("q") ?? ""
    if (q === current) return
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (q) params.set("q", q)
      else params.delete("q")
      params.delete("offset")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, router, pathname, searchParams])

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-56 pl-9!"
      />
    </div>
  )
}
