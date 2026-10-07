"use client"

import { BotIcon } from "lucide-react"

import type { Actor } from "@/lib/issues"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: { box: "size-5", radius: "rounded-[4px]", text: "text-[8px]", glyph: "size-3" },
  md: { box: "size-[22px]", radius: "rounded-[5px]", text: "text-[8px]", glyph: "size-3" },
  lg: { box: "size-9", radius: "rounded-lg", text: "text-caption", glyph: "size-[18px]" },
} as const

const HUMAN_TONE = {
  brand: "bg-brand text-brand-foreground",
  neutral: "bg-zinc-700 text-zinc-50",
} as const

/**
 * Shape is the agent/human signal, as the requirements lock it: agents are
 * a square bot glyph, humans a round disc of initials. Unassigned renders a
 * dashed placeholder with a dash, like the mock.
 */
export function ActorAvatar({
  actor,
  size = "md",
  className,
}: {
  actor: Actor | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const s = SIZES[size]

  if (!actor) {
    return (
      <span
        aria-hidden
        className={cn(
          "border-surface-border text-muted-foreground grid shrink-0 place-items-center rounded-full border border-dashed leading-none",
          s.box,
          s.text,
          className
        )}
      >
        –
      </span>
    )
  }

  const isAgent = actor.kind === "agent"

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center font-bold tracking-wide",
        s.box,
        isAgent
          ? cn(s.radius, "bg-zinc-900 text-zinc-50 dark:bg-zinc-700")
          : cn("rounded-full", s.text, HUMAN_TONE[actor.tone ?? "neutral"]),
        className
      )}
    >
      {isAgent ? (
        <BotIcon className={s.glyph} strokeWidth={1.75} aria-hidden />
      ) : (
        actor.initials
      )}
      <span className="sr-only">
        {actor.name}
        {isAgent ? " (agent)" : ""}
      </span>
    </span>
  )
}
