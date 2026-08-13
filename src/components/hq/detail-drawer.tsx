"use client"

import { useState, useRef, useEffect } from "react"
import { HQCard, CardLabel, STATUSES, STATUS_LABELS, LABEL_OPTIONS } from "@/lib/hq/types"
import { StatusPill } from "./status-pill"
import { LabelChip } from "./label-chip"
import { OwnerAvatar } from "./owner-avatar"

function formatChicago(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

interface DetailDrawerProps {
  card: HQCard
  onClose: () => void
  onUpdate: (updated: HQCard) => void
}

export function DetailDrawer({ card, onClose, onUpdate }: DetailDrawerProps) {
  const [commentText, setCommentText] = useState("")
  const [commentAuthor, setCommentAuthor] = useState("Rashad")
  const [posting, setPosting] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [card.comments.length])

  async function patchCard(patch: Partial<HQCard>) {
    const res = await fetch(`/api/hq/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
    }
  }

  async function postComment() {
    if (!commentText.trim()) return
    setPosting(true)
    const res = await fetch(`/api/hq/cards/${card.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: commentAuthor, body: commentText.trim() }),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
      setCommentText("")
    }
    setPosting(false)
  }

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{ borderColor: "#EAE8E2", backgroundColor: "#FFFFFF" }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b flex-shrink-0"
        style={{ borderColor: "#EAE8E2" }}
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-[#1A1C18] leading-snug">{card.title}</h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <OwnerAvatar owner={card.owner} size="md" />
            <span className="text-sm text-[#6B6E65]">{card.owner}</span>
            <StatusPill status={card.status} />
          </div>
          {card.chlk_key && (
            <span
              className="mt-1.5 inline-block text-xs text-[#9BA39A] tracking-wide"
              style={{ fontFamily: "var(--font-jetbrains, monospace)" }}
            >
              {card.chlk_key}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-[#9BA39A] hover:text-[#1A1C18] transition-colors flex-shrink-0 p-1 -mr-1 rounded"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Status selector */}
        <section>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-2">
            Status
          </label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => patchCard({ status: s })}
                className={[
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                  card.status === s
                    ? "border-[#2B76BA] bg-[#E1F2FB] text-[#1A5A8A]"
                    : "border-[#EAE8E2] bg-white text-[#6B6E65] hover:border-[#2B76BA]",
                ].join(" ")}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        {/* Label picker */}
        <section>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-2">
            Label
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => patchCard({ label: undefined })}
              className={[
                "px-2.5 py-1 rounded-full text-xs border transition-all",
                !card.label
                  ? "border-[#2B76BA] bg-[#E1F2FB] text-[#1A5A8A]"
                  : "border-[#EAE8E2] bg-white text-[#6B6E65] hover:border-[#C5C3BD]",
              ].join(" ")}
            >
              none
            </button>
            {LABEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => patchCard({ label: opt.value as CardLabel })}
                className={[
                  "rounded-full border transition-all",
                  card.label === opt.value
                    ? "border-[#2B76BA] ring-1 ring-[#2B76BA]"
                    : "border-transparent hover:border-[#C5C3BD]",
                ].join(" ")}
              >
                <LabelChip label={opt.value} />
              </button>
            ))}
          </div>
        </section>

        {/* Description */}
        <section>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-2">
            Description
          </label>
          <textarea
            defaultValue={card.description ?? ""}
            onBlur={(e) => {
              if (e.target.value !== (card.description ?? "")) {
                patchCard({ description: e.target.value })
              }
            }}
            rows={4}
            placeholder="What's being built…"
            className="w-full text-sm text-[#1A1C18] bg-[#F6F5F2] rounded-lg px-3 py-2.5 border border-[#EAE8E2] resize-none focus:outline-none focus:border-[#2B76BA] transition-colors placeholder:text-[#C5C3BD]"
          />
        </section>

        {/* Estimate */}
        <section>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-2">
            Estimate
          </label>
          <div
            className="flex items-center gap-2 bg-[#F6F5F2] rounded-lg px-3 py-2 border border-[#EAE8E2] w-32"
          >
            <input
              type="number"
              step="0.5"
              min="0"
              defaultValue={card.estimate_hours ?? ""}
              onBlur={(e) => {
                const val = e.target.value === "" ? undefined : parseFloat(e.target.value)
                if (val !== card.estimate_hours) {
                  patchCard({ estimate_hours: val })
                }
              }}
              placeholder="—"
              className="w-full text-sm text-[#1A1C18] bg-transparent focus:outline-none min-w-0"
              style={{ fontFamily: "var(--font-jetbrains, monospace)" }}
            />
            <span className="text-sm text-[#9BA39A] flex-shrink-0">h</span>
          </div>
        </section>

        {/* Comments */}
        <section>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-3">
            Comments
          </label>
          {card.comments.length === 0 && (
            <p className="text-sm text-[#C5C3BD] italic">No comments yet.</p>
          )}
          <div className="space-y-4">
            {card.comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <OwnerAvatar owner={c.author} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-[#1A1C18]">{c.author}</span>
                    <span className="text-[10px] text-[#9BA39A]">{formatChicago(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-[#4A4C47] leading-snug">{c.body}</p>
                </div>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </section>
      </div>

      {/* Comment composer */}
      <div
        className="px-5 pb-5 pt-3 border-t flex-shrink-0"
        style={{ borderColor: "#EAE8E2" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <label className="text-[10px] text-[#9BA39A]">Posting as:</label>
          <input
            type="text"
            value={commentAuthor}
            onChange={(e) => setCommentAuthor(e.target.value)}
            className="text-xs text-[#1A1C18] bg-transparent border-b border-[#EAE8E2] focus:outline-none focus:border-[#2B76BA] px-0.5 w-28"
          />
        </div>
        <div className="flex gap-2">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment()
            }}
            rows={2}
            placeholder="Add a comment… (⌘↵ to send)"
            className="flex-1 text-sm bg-[#F6F5F2] rounded-lg px-3 py-2 border border-[#EAE8E2] resize-none focus:outline-none focus:border-[#2B76BA] transition-colors placeholder:text-[#C5C3BD] text-[#1A1C18]"
          />
          <button
            onClick={postComment}
            disabled={posting || !commentText.trim()}
            className="self-end px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: "#2B76BA" }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
