"use client"

import { BotIcon } from "lucide-react"

import type { Actor } from "@/lib/issues"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const SIZES = {
  sm: { box: "size-5", text: "text-micro", glyph: "size-3" },
  md: { box: "size-6", text: "text-micro", glyph: "size-3.5" },
  lg: { box: "size-8", text: "text-caption", glyph: "size-4" },
} as const

/**
 * Every actor is round — shape is deliberately NOT the agent/human signal, so
 * that a presence dot can carry status instead. Agents render a bot glyph,
 * humans their initials. Unassigned renders a dashed placeholder.
 */
export function ActorAvatar({
  actor,
  size = "md",
  showPresence = false,
  className,
}: {
  actor: Actor | null
  size?: keyof typeof SIZES
  showPresence?: boolean
  className?: string
}) {
  const s = SIZES[size]

  if (!actor) {
    return (
      <span
        aria-hidden
        className={cn(
          "border-faint-foreground/50 shrink-0 rounded-full border border-dashed",
          s.box,
          className
        )}
      />
    )
  }

  const isAgent = actor.kind === "agent"

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={cn(s.box, "rounded-full")}>
        <AvatarFallback
          className={cn(
            "rounded-full! font-medium",
            s.text,
            isAgent
              ? "bg-brand/12! text-brand!"
              : "bg-muted! text-muted-foreground!"
          )}
        >
          {isAgent ? (
            <BotIcon className={s.glyph} aria-hidden />
          ) : (
            actor.initials
          )}
        </AvatarFallback>
      </Avatar>
      {showPresence && isAgent && (
        <span
          aria-hidden
          className={cn(
            "ring-surface absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2",
            actor.presence === "working" ? "bg-success" : "bg-muted-foreground/40"
          )}
        />
      )}
      <span className="sr-only">
        {actor.name}
        {isAgent ? " (agent)" : ""}
      </span>
    </span>
  )
}
