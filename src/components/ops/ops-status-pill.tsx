"use client"

import { OpsStatus, OPS_STATUS_LABELS } from "@/lib/ops/types"

const STYLES: Record<OpsStatus, { bg: string; text: string; dot: string }> = {
  to_do:       { bg: "#EDECE8", text: "#4A4C47", dot: "#9BA39A" },
  in_progress: { bg: "#DDEEF8", text: "#1A5A8A", dot: "#2B76BA" },
  blocked:     { bg: "#FDECEA", text: "#9B2A17", dot: "#DE4728" },
  done:        { bg: "#D9F0E5", text: "#1E6B42", dot: "#3E9E6E" },
}

export function OpsStatusPill({ status }: { status: OpsStatus }) {
  const s = STYLES[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
      {OPS_STATUS_LABELS[status]}
    </span>
  )
}
