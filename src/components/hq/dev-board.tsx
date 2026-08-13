"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
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

  // Track the status the dragged card had when the drag began
  const dragOriginStatus = useRef<CardStatus | null>(null)

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
    return cards
      .filter((c) => c.status === status)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    const card = cards.find((c) => c.id === id) ?? null
    setActiveCard(card)
    dragOriginStatus.current = card?.status ?? null
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const draggingCard = cards.find((c) => c.id === activeId)
    if (!draggingCard) return

    const targetStatus: CardStatus | undefined = STATUSES.includes(overId as CardStatus)
      ? (overId as CardStatus)
      : cards.find((c) => c.id === overId)?.status

    if (!targetStatus || draggingCard.status === targetStatus) return

    // Optimistic cross-column move
    setCards((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, status: targetStatus } : c))
    )
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)

    const originStatus = dragOriginStatus.current
    dragOriginStatus.current = null

    if (!over || !originStatus) return

    const activeId = active.id as string
    const overId = over.id as string

    // Read the card's current (post-DragOver) status from state
    setCards((prev) => {
      const currentCard = prev.find((c) => c.id === activeId)
      if (!currentCard) return prev

      const finalStatus = currentCard.status

      // Same-column reorder
      if (finalStatus === originStatus && activeId !== overId) {
        const overCard = prev.find((c) => c.id === overId)
        if (overCard && overCard.status === finalStatus) {
          const colCards = prev.filter((c) => c.status === finalStatus)
          const oldIdx = colCards.findIndex((c) => c.id === activeId)
          const newIdx = colCards.findIndex((c) => c.id === overId)
          if (oldIdx !== -1 && newIdx !== -1) {
            const reordered = arrayMove(colCards, oldIdx, newIdx)
            const others = prev.filter((c) => c.status !== finalStatus)
            return [...others, ...reordered]
          }
        }
      }

      return prev
    })

    // Persist cross-column status change
    setCards((prev) => {
      const currentCard = prev.find((c) => c.id === activeId)
      if (!currentCard || currentCard.status === originStatus) return prev

      // Fire and forget the persist
      fetch(`/api/hq/cards/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: currentCard.status }),
      }).catch(() => {
        // On error, revert the card to its origin status
        setCards((p) =>
          p.map((c) => (c.id === activeId ? { ...c, status: originStatus } : c))
        )
      })

      return prev
    })
  }

  function handleSelect(card: HQCard) {
    setSelectedId((prev) => (prev === card.id ? null : card.id))
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
      {/* Board */}
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

          <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
            {activeCard && (
              <div className="rotate-1 opacity-95 shadow-2xl w-[230px]">
                <CompactCard card={activeCard} isSelected={false} onClick={() => {}} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Detail drawer */}
      {selectedCard && (
        <div
          className="w-[400px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden border-l"
          style={{ borderColor: "#EAE8E2" }}
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
