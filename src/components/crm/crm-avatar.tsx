import { contactInitials } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function CrmAvatar({
  name,
  email,
  firstName,
  lastName,
  className,
}: {
  name?: string
  email?: string
  firstName?: string | null
  lastName?: string | null
  className?: string
}) {
  const initials = firstName || lastName || email
    ? contactInitials({ firstName: firstName ?? null, lastName: lastName ?? null, email: email ?? name ?? "?" })
    : (name ?? "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase() || "?"

  return (
    <Avatar className={cn("size-6", className)} size="sm">
      <AvatarFallback className="bg-muted text-muted-foreground text-[0.65rem] font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
