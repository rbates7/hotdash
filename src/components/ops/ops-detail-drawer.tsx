"use client"

import { useState, useRef, useEffect } from "react"
import { OpsCard, OPS_STATUSES, OPS_STATUS_LABELS } from "@/lib/ops/types"
import { OpsStatusPill } from "./ops-status-pill"
import { OwnerAvatar } from "@/components/hq/owner-avatar"

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

interface Props {
  card: OpsCard
  onClose: () => void
  onUpdate: (updated: OpsCard) => void
}

export function OpsDetailDrawer({ card, onClose, onUpdate }: Props) {
  const [commentText, setCommentText] = useState("")
  const [commentAuthor, setCommentAuthor] = useState("Rashad")
  const [posting, setPosting] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [card.comments.length])

  async function patchCard(patch: Record<string, unknown>) {
    const res = await fetch(`/api/ops/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) onUpdate(await res.json())
  }

  async function postComment() {
    if (!commentText.trim()) return
    setPosting(true)
    const res = await fetch(`/api/ops/cards/${card.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: commentAuthor, body: commentText.trim() }),
    })
    if (res.ok) {
      onUpdate(await res.json())
      setCommentText("")
    }
    setPosting(false)
  }

  const isBlocked = card.status === "blocked"

  return (
    <div className="flex flex-col h-full bg-white">
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
            <OpsStatusPill status={card.status} />
          </div>
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
        {/* Status */}
        <section>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-2">
            Status
          </label>
          <div className="flex flex-wrap gap-1.5">
            {OPS_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => patchCard({ status: s })}
                className={[
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                  card.status === s
                    ? s === "blocked"
                      ? "border-[#DE4728] bg-[#FDECEA] text-[#9B2A17]"
                      : "border-[#2B76BA] bg-[#E1F2FB] text-[#1A5A8A]"
                    : "border-[#EAE8E2] bg-white text-[#6B6E65] hover:border-[#2B76BA]",
                ].join(" ")}
              >
                {OPS_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        {/* Description */}
        <section key={`ops-desc-${card.id}`}>
          <label className="text-[10px] font-semibold text-[#9BA39A] uppercase tracking-widest block mb-2">
            Description
          </label>
          <textarea
            defaultValue={card.description ?? ""}
            onBlur={(e) => {
              if (e.target.value !== (card.description ?? "")) {
                patchCard({ description: e.target.value || null })
              }
            }}
            rows={4}
            placeholder="What's the work…"
            className="w-full text-sm text-[#1A1C18] bg-[#F6F5F2] rounded-lg px-3 py-2.5 border border-[#EAE8E2] resize-none focus:outline-none focus:border-[#2B76BA] transition-colors placeholder:text-[#C5C3BD]"
          />
        </section>

        {/* Blocker reason — always shown when blocked, shown as editable field */}
        {isBlocked && (
          <section key={`ops-blocker-${card.id}`}>
            <label className="text-[10px] font-semibold text-[#9B2A17] uppercase tracking-widest block mb-2">
              Blocker Reason
            </label>
            <div
              className="rounded-lg px-3 py-2.5 border"
              style={{ backgroundColor: "#FDECEA", borderColor: "#F5C6C0" }}
            >
              <textarea
                defaultValue={card.blocker_reason ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (card.blocker_reason ?? "")) {
                    patchCard({ blocker_reason: e.target.value || null })
                  }
                }}
                rows={2}
                placeholder="Why is this blocked?"
                className="w-full text-sm font-medium bg-transparent focus:outline-none resize-none placeholder:font-normal placeholder:text-[#F5A89A]"
                style={{ color: "#9B2A17" }}
              />
            </div>
          </section>
        )}

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
                  <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
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
      <div className="px-5 pb-5 pt-3 border-t flex-shrink-0" style={{ borderColor: "#EAE8E2" }}>
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
