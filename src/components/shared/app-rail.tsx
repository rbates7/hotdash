"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function AppRail() {
  const pathname = usePathname()
  const isOps = pathname.startsWith("/ops")

  return (
    <nav
      className="w-[58px] flex-shrink-0 flex flex-col items-center py-4 gap-3 border-r"
      style={{ borderColor: "#EAE8E2", backgroundColor: "#FCFAF5" }}
    >
      {/* Favicon */}
      <div className="w-8 h-8 flex items-center justify-center">
        <Image src="/brand/chlk-favicon.svg" alt="Chlk" width={32} height={32} priority />
      </div>

      <div className="w-5 h-px" style={{ backgroundColor: "#EAE8E2" }} />

      {/* Dev board */}
      <Link
        href="/"
        title="Dev board"
        className={[
          "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
          !isOps ? "bg-[#E1F2FB]" : "hover:bg-[#F6F5F2]",
        ].join(" ")}
        aria-current={!isOps ? "page" : undefined}
      >
        {/* Kanban columns icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="5" height="18" rx="1.5"
            fill={!isOps ? "#2B76BA" : "#9BA39A"} opacity="0.9" />
          <rect x="9.5" y="3" width="5" height="13" rx="1.5"
            fill={!isOps ? "#2B76BA" : "#9BA39A"} opacity="0.6" />
          <rect x="16" y="3" width="5" height="9" rx="1.5"
            fill={!isOps ? "#2B76BA" : "#9BA39A"} opacity="0.35" />
        </svg>
      </Link>

      {/* Ops board */}
      <Link
        href="/ops"
        title="Ops board"
        className={[
          "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
          isOps ? "bg-[#E1F2FB]" : "hover:bg-[#F6F5F2]",
        ].join(" ")}
        aria-current={isOps ? "page" : undefined}
      >
        {/* Grid / crew icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5"
            fill={isOps ? "#2B76BA" : "#9BA39A"} opacity="0.9" />
          <rect x="13" y="3" width="8" height="8" rx="1.5"
            fill={isOps ? "#2B76BA" : "#9BA39A"} opacity="0.6" />
          <rect x="3" y="13" width="8" height="8" rx="1.5"
            fill={isOps ? "#2B76BA" : "#9BA39A"} opacity="0.6" />
          <rect x="13" y="13" width="8" height="8" rx="1.5"
            fill={isOps ? "#2B76BA" : "#9BA39A"} opacity="0.35" />
        </svg>
      </Link>
    </nav>
  )
}
