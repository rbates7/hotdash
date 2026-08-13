"use client"

import { HQCard, CardStatus, STATUS_LABELS } from "@/lib/hq/types"
import { CompactCard } from "./compact-card"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

interface BoardColumnProps {
  status: CardStatus
  cards: HQCard[]
  selectedId: string | null
  onSelect: (card: HQCard) => void
}

export function BoardColumn({ status, cards, selectedId, onSelect }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col min-w-[220px] flex-1 max-w-[280px]">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <h3 className="text-[11px] font-bold text-[#6B6E65] uppercase tracking-widest">
          {STATUS_LABELS[status]}
        </h3>
        <span
          className="inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1"
          style={{
            backgroundColor: cards.length > 0 ? "#EAE8E2" : "#F6F5F2",
            color: cards.length > 0 ? "#4A4C47" : "#C5C3BD",
          }}
        >
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          "flex-1 rounded-xl p-2 space-y-2 min-h-[120px] transition-colors duration-150",
          isOver ? "bg-[#E1F2FB]" : "bg-[#F6F5F2]",
        ].join(" ")}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CompactCard
              key={card.id}
              card={card}
              isSelected={selectedId === card.id}
              onClick={() => onSelect(card)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-[#C5C3BD]">
            Empty
          </div>
        )}
      </div>
    </div>
  )
}
