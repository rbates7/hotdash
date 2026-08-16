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
import { OpsCard, OpsStatus, OPS_STATUSES } from "@/lib/ops/types"
import { OpsBoardColumn } from "./ops-board-column"
import { OpsDetailDrawer } from "./ops-detail-drawer"
import { OpsCompactCard } from "./ops-compact-card"

export function OpsBoard() {
  const [cards, setCards] = useState<OpsCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCard, setActiveCard] = useState<OpsCard | null>(null)
  const [loading, setLoading] = useState(true)
  const dragOriginStatus = useRef<OpsStatus | null>(null)

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/ops/cards")
    if (res.ok) setCards(await res.json())
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCards() }, [fetchCards])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function cardsByStatus(status: OpsStatus): OpsCard[] {
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
    const target: OpsStatus | undefined = OPS_STATUSES.includes(overId as OpsStatus)
      ? (overId as OpsStatus)
      : cards.find((c) => c.id === overId)?.status
    if (!target || draggingCard.status === target) return
    setCards((prev) => prev.map((c) => (c.id === activeId ? { ...c, status: target } : c)))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    const originStatus = dragOriginStatus.current
    dragOriginStatus.current = null
    if (!over || !originStatus) return

    const activeId = active.id as string
    const overId = over.id as string

    setCards((prev) => {
      const currentCard = prev.find((c) => c.id === activeId)
      if (!currentCard) return prev
      const finalStatus = currentCard.status
      if (finalStatus === originStatus && activeId !== overId) {
        const overCard = prev.find((c) => c.id === overId)
        if (overCard?.status === finalStatus) {
          const col = prev.filter((c) => c.status === finalStatus)
          const oldIdx = col.findIndex((c) => c.id === activeId)
          const newIdx = col.findIndex((c) => c.id === overId)
          if (oldIdx !== -1 && newIdx !== -1) {
            const reordered = arrayMove(col, oldIdx, newIdx)
            return [...prev.filter((c) => c.status !== finalStatus), ...reordered]
          }
        }
      }
      return prev
    })

    setCards((prev) => {
      const currentCard = prev.find((c) => c.id === activeId)
      if (!currentCard || currentCard.status === originStatus) return prev
      fetch(`/api/ops/cards/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: currentCard.status }),
      }).catch(() => {
        setCards((p) => p.map((c) => (c.id === activeId ? { ...c, status: originStatus } : c)))
      })
      return prev
    })
  }

  function handleUpdate(updated: OpsCard) {
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
              {OPS_STATUSES.map((status) => (
                <OpsBoardColumn
                  key={status}
                  status={status}
                  cards={cardsByStatus(status)}
                  selectedId={selectedId}
                  onSelect={(c) => setSelectedId((prev) => (prev === c.id ? null : c.id))}
                />
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
            {activeCard && (
              <div className="rotate-1 opacity-95 shadow-2xl w-[230px]">
                <OpsCompactCard card={activeCard} isSelected={false} onClick={() => {}} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedCard && (
        <div
          className="w-[400px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden border-l"
          style={{ borderColor: "#EAE8E2" }}
        >
          <OpsDetailDrawer
            card={selectedCard}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
          />
        </div>
      )}
    </div>
  )
}
