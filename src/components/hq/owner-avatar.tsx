"use client"

function initials(name: string): string {
  if (!name || name === "Unassigned") return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic color from name
const AVATAR_COLORS = [
  { bg: "#DDEEF8", text: "#1A5A8A" },
  { bg: "#D9F0E5", text: "#1E6B42" },
  { bg: "#F0EAF7", text: "#5C3D82" },
  { bg: "#FDECEA", text: "#9B2A17" },
  { bg: "#FEF3D7", text: "#7A5A0E" },
  { bg: "#EDECE8", text: "#4A4C47" },
]

function colorFor(name: string) {
  if (!name || name === "Unassigned") return { bg: "#EAE8E2", text: "#9BA39A" }
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface OwnerAvatarProps {
  owner: string
  size?: "sm" | "md"
}

export function OwnerAvatar({ owner, size = "sm" }: OwnerAvatarProps) {
  const color = colorFor(owner)
  const dim = size === "md" ? "w-7 h-7 text-xs" : "w-5 h-5 text-[10px]"

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 ${dim}`}
      style={{ backgroundColor: color.bg, color: color.text }}
      title={owner}
    >
      {initials(owner)}
    </span>
  )
}
