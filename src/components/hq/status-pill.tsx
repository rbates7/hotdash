"use client"

import { CardStatus, STATUS_LABELS } from "@/lib/hq/types"

const STATUS_STYLES: Record<CardStatus, { bg: string; text: string }> = {
  backlog: { bg: "#EDECE8", text: "#4A4C47" },
  to_do: { bg: "#EDECE8", text: "#4A4C47" },
  building: { bg: "#DDEEF8", text: "#1A5A8A" },
  review: { bg: "#F0EAF7", text: "#5C3D82" },
  done: { bg: "#D9F0E5", text: "#1E6B42" },
}

interface StatusPillProps {
  status: CardStatus
}

export function StatusPill({ status }: StatusPillProps) {
  const styles = STATUS_STYLES[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: styles.bg, color: styles.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor:
            status === "building"
              ? "#2B76BA"
              : status === "review"
              ? "#9A6BA6"
              : status === "done"
              ? "#3E9E6E"
              : "#9BA39A",
        }}
      />
      {STATUS_LABELS[status]}
    </span>
  )
}
