"use client"

import { OpsCard } from "@/lib/ops/types"
import { OwnerAvatar } from "@/components/hq/owner-avatar"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface Props {
  card: OpsCard
  isSelected: boolean
  onClick: () => void
}

export function OpsCompactCard({ card, isSelected, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  const isBlocked = card.status === "blocked"

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={[
        "rounded-lg p-3 cursor-pointer select-none border transition-all duration-100",
        isSelected
          ? "border-[#2B76BA] bg-[#E1F2FB]"
          : "border-[#EAE8E2] bg-white hover:border-[#C5C3BD] hover:shadow-sm",
      ].join(" ")}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-[#1A1C18] leading-snug mb-1.5 line-clamp-2">
        {card.title}
      </p>

      {/* Snippet */}
      {card.description && (
        <p className="text-[11px] text-[#6B6E65] leading-snug mb-2 line-clamp-2">
          {card.description}
        </p>
      )}

      {/* Blocker reason — red line */}
      {isBlocked && card.blocker_reason && (
        <p className="text-[11px] font-medium text-[#DE4728] leading-snug mb-2 line-clamp-1">
          {card.blocker_reason}
        </p>
      )}

      {/* Blocker reason missing warning */}
      {isBlocked && !card.blocker_reason && (
        <p className="text-[11px] font-medium text-[#DE4728] leading-snug mb-2 italic">
          No blocker reason — add one
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <OwnerAvatar owner={card.owner} size="sm" />
          <span className="text-[11px] text-[#6B6E65] truncate">{card.owner}</span>
        </div>
        {card.comments.length > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] text-[#9BA39A] flex-shrink-0">
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
  )
}
