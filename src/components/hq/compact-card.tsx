"use client"

import { HQCard } from "@/lib/hq/types"
import { LabelChip } from "./label-chip"
import { OwnerAvatar } from "./owner-avatar"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface CompactCardProps {
  card: HQCard
  isSelected: boolean
  onClick: () => void
}

export function CompactCard({ card, isSelected, onClick }: CompactCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={[
        "rounded-lg p-3 cursor-pointer select-none",
        "border transition-all duration-100",
        isSelected
          ? "border-[#2B76BA] bg-[#E1F2FB]"
          : "border-[#EAE8E2] bg-white hover:border-[#C5C3BD] hover:shadow-sm",
      ].join(" ")}
    >
      {/* Key + label row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        {card.chlk_key ? (
          <span
            className="text-[10px] font-mono text-[#9BA39A] tracking-wide"
            style={{ fontFamily: "var(--font-jetbrains, monospace)" }}
          >
            {card.chlk_key}
          </span>
        ) : (
          <span />
        )}
        {card.label && <LabelChip label={card.label} size="xs" />}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-[#1A1C18] leading-snug mb-2 line-clamp-2">
        {card.title}
      </p>

      {/* Description snippet */}
      {card.description && (
        <p className="text-[11px] text-[#6B6E65] leading-snug mb-2 line-clamp-2">
          {card.description}
        </p>
      )}

      {/* Footer: avatar + name, estimate, comments */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <OwnerAvatar owner={card.owner} size="sm" />
          <span className="text-[11px] text-[#6B6E65] truncate">{card.owner}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {card.estimate_hours != null && (
            <span className="text-[11px] font-mono text-[#6B6E65]">
              {card.estimate_hours}h
            </span>
          )}
          {card.comments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-[#9BA39A]">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path
                  d="M14 2H2C1.45 2 1 2.45 1 3v9c0 .55.45 1 1 1h2v2.5L7.5 13H14c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z"
                  fill="currentColor"
                  opacity="0.5"
                />
              </svg>
              {card.comments.length}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
