"use client"

import Image from "next/image"
import { DevBoard } from "./dev-board"
import { AppRail } from "@/components/shared/app-rail"

export function HQShell() {
  return (
    <div className="flex h-full" style={{ backgroundColor: "#FCFAF5" }}>
      <AppRail />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Top bar */}
        <header
          className="h-[52px] flex items-center px-6 border-b flex-shrink-0 gap-3"
          style={{ borderColor: "#EAE8E2", backgroundColor: "#FCFAF5" }}
        >
          <Image
            src="/brand/chlk-script-navy.svg"
            alt="Chlk"
            width={56}
            height={22}
            className="flex-shrink-0"
            priority
          />
          <div className="h-4 w-px flex-shrink-0" style={{ backgroundColor: "#EAE8E2" }} />
          <div className="flex flex-col justify-center">
            <span className="text-sm font-semibold text-[#1A1C18] leading-none">Dev board</span>
            <span className="text-[10px] text-[#9BA39A] leading-none mt-0.5">Tickets. Click a card.</span>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden flex">
          <DevBoard />
        </div>
      </div>
    </div>
  )
}
