import { cn } from "@/lib/utils"

const AVATAR_TONES = [
  "bg-chart-1/20 text-chart-1",
  "bg-chart-2/20 text-chart-2",
  "bg-chart-3/20 text-chart-3",
  "bg-chart-4/20 text-chart-4",
  "bg-chart-5/20 text-chart-5",
]

function toneFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]
}

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
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold uppercase select-none",
        toneFor(name),
        className
      )}
      {...props}
    >
      {initialsFor(name)}
    </span>
  )
}

export { ContactAvatar, initialsFor }
