import { cn } from "@/lib/utils"

// One tone for everyone. An earlier version hashed the name onto the chart
// palette for variety, but that palette is a greyscale ramp — so some
// avatars came out bright and others nearly vanished, which read as a
// signal about the person when it was only a hash of their name.
function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function ContactAvatar({
  name,
  className,
  ...props
}: React.ComponentProps<"span"> & { name: string }) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        "bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold uppercase select-none",
        className
      )}
      {...props}
    >
      {initialsFor(name)}
    </span>
  )
}

export { ContactAvatar, initialsFor }
