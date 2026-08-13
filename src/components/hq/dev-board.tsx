"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { HQCard, CardStatus, STATUSES } from "@/lib/hq/types"
import { BoardColumn } from "./board-column"
import { DetailDrawer } from "./detail-drawer"
import { CompactCard } from "./compact-card"

export function DevBoard() {
  const [cards, setCards] = useState<HQCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCard, setActiveCard] = useState<HQCard | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/hq/cards")
    if (res.ok) {
      const data: HQCard[] = await res.json()
      setCards(data)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCards() }, [fetchCards])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function cardsByStatus(status: CardStatus): HQCard[] {
    return cards.filter((c) => c.status === status)
  }

  function handleDragStart({ active }: { active: { id: string | number } }) {
    const card = cards.find((c) => c.id === active.id)
    setActiveCard(card ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeCard = cards.find((c) => c.id === activeId)
    if (!activeCard) return

    // Determine target status
    const targetStatus = STATUSES.includes(overId as CardStatus)
      ? (overId as CardStatus)
      : cards.find((c) => c.id === overId)?.status

    if (!targetStatus || activeCard.status === targetStatus) return

    // Optimistically update status
    setCards((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, status: targetStatus } : c
      )
    )
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const movedCard = cards.find((c) => c.id === activeId)
    if (!movedCard) return

    // Target status
    const targetStatus = STATUSES.includes(overId as CardStatus)
      ? (overId as CardStatus)
      : cards.find((c) => c.id === overId)?.status

    if (!targetStatus) return

    // Reorder within same column
    if (movedCard.status === targetStatus && activeId !== overId) {
      const colCards = cardsByStatus(targetStatus)
      const oldIdx = colCards.findIndex((c) => c.id === activeId)
      const newIdx = colCards.findIndex((c) => c.id === overId)
      if (oldIdx !== -1 && newIdx !== -1) {
        const reordered = arrayMove(colCards, oldIdx, newIdx)
        setCards((prev) => {
          const others = prev.filter((c) => c.status !== targetStatus)
          return [...others, ...reordered]
        })
      }
    }

    // Persist status change to server
    if (movedCard.status !== targetStatus || true) {
      const finalCard = cards.find((c) => c.id === activeId)
      if (finalCard && finalCard.status !== movedCard.status) {
        await fetch(`/api/hq/cards/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: finalCard.status }),
        })
      } else if (targetStatus !== movedCard.status) {
        await fetch(`/api/hq/cards/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        })
      }
    }
  }

  function handleSelect(card: HQCard) {
    setSelectedId(selectedId === card.id ? null : card.id)
  }

  function handleUpdate(updated: HQCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setSelectedId(updated.id)
  }

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-[#9BA39A]">Loading board…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Board area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 h-full px-6 py-5 min-w-fit">
              {STATUSES.map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  cards={cardsByStatus(status)}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeCard && (
              <div className="rotate-2 opacity-90 shadow-xl w-[220px]">
                <CompactCard
                  card={activeCard}
                  isSelected={false}
                  onClick={() => {}}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Detail drawer */}
      {selectedCard && (
        <div
          className="w-[400px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden"
          style={{ borderLeft: "1px solid #EAE8E2" }}
        >
          <DetailDrawer
            card={selectedCard}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
          />
        </div>
      )}
    </div>
  )
}
