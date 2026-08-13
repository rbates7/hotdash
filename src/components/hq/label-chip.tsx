"use client"

import { CardLabel } from "@/lib/hq/types"

const LABEL_STYLES: Record<CardLabel, { bg: string; text: string; dot: string }> = {
  feature: { bg: "#E1F2FB", text: "#1A5A8A", dot: "#2B76BA" },
  bug: { bg: "#FDECEA", text: "#9B2A17", dot: "#DE4728" },
  chore: { bg: "#EDECE8", text: "#4A4C47", dot: "#6B6E65" },
  spike: { bg: "#EEE8F7", text: "#5C3D82", dot: "#9A6BA6" },
}

interface LabelChipProps {
  label: CardLabel
  size?: "sm" | "xs"
}

export function LabelChip({ label, size = "sm" }: LabelChipProps) {
  const styles = LABEL_STYLES[label]
  const px = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${px}`}
      style={{ backgroundColor: styles.bg, color: styles.text }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: styles.dot }}
      />
      {label}
    </span>
  )
}
