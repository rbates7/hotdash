import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export const FOUNDER_NAME = "Rashad Bates"
export const FOUNDER_ROLE = "Founder"
export const FOUNDER_INITIALS = "RB"

export function FounderIdentity() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 p-1">
      <Avatar className="size-8 shrink-0">
        {/* Darker than `--brand` so "RB" clears 4.5:1. `!` beats Nova's muted fallback. */}
        <AvatarFallback className="bg-[oklch(0.42_0.16_253)]! text-white! text-xs font-semibold">
          {FOUNDER_INITIALS}
        </AvatarFallback>
      </Avatar>
      <div
        data-founder-copy
        className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden"
      >
        <span className="text-muted-foreground text-[0.625rem] font-medium tracking-widest uppercase">
          {FOUNDER_ROLE}
        </span>
        <span className="truncate text-sm font-semibold">{FOUNDER_NAME}</span>
      </div>
    </div>
  )
}
