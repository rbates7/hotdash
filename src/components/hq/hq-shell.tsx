"use client"

import Image from "next/image"
import { DevBoard } from "./dev-board"

export function HQShell() {
  return (
    <div className="flex h-full" style={{ backgroundColor: "#FCFAF5" }}>
      {/* Left rail — 58px */}
      <nav
        className="w-[58px] flex-shrink-0 flex flex-col items-center py-4 gap-4 border-r"
        style={{ borderColor: "#EAE8E2", backgroundColor: "#FCFAF5" }}
      >
        {/* Favicon / logo */}
        <div className="w-8 h-8 flex items-center justify-center">
          <Image
            src="/brand/chlk-favicon.svg"
            alt="Chlk"
            width={32}
            height={32}
            priority
          />
        </div>

        {/* Divider */}
        <div className="w-5 h-px" style={{ backgroundColor: "#EAE8E2" }} />

        {/* Dev board nav icon — active */}
        <button
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: "#E1F2FB" }}
          title="Dev board"
          aria-current="page"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="5" height="18" rx="1.5" fill="#2B76BA" opacity="0.9" />
            <rect x="9.5" y="3" width="5" height="13" rx="1.5" fill="#2B76BA" opacity="0.6" />
            <rect x="16" y="3" width="5" height="9" rx="1.5" fill="#2B76BA" opacity="0.35" />
          </svg>
        </button>
      </nav>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Top bar */}
        <header
          className="h-[52px] flex items-center px-6 border-b flex-shrink-0 gap-4"
          style={{ borderColor: "#EAE8E2", backgroundColor: "#FCFAF5" }}
        >
          {/* Wordmark */}
          <Image
            src="/brand/chlk-script-navy.svg"
            alt="Chlk"
            width={56}
            height={22}
            className="flex-shrink-0"
            priority
          />
          <div className="h-4 w-px" style={{ backgroundColor: "#EAE8E2" }} />
          <span className="text-sm font-semibold text-[#1A1C18]">Dev board</span>
          <div className="flex-1" />
          <span
            className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
            style={{ backgroundColor: "#E1F2FB", color: "#1A5A8A" }}
          >
            v0
          </span>
        </header>

        {/* Board */}
        <div className="flex-1 min-h-0 overflow-hidden flex">
          <DevBoard />
        </div>
      </div>
    </div>
  )
}
