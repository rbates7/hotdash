"use client"

import { HeaderActions, NewBetButton } from "@/components/product-roadmap/header-actions"
import {
  ROADMAP_DESKTOP_NEW_BET,
  ROADMAP_HEADER,
  ROADMAP_HEADER_TITLE_ROW,
  ROADMAP_PHONE_NEW_BET,
} from "@/components/product-roadmap/responsive"

/**
 * Title, persistence note, sample badge, and New bet. On phone New bet sits
 * beside the title (Deke 13:2202); from `md` it stays in Page actions, which
 * is the desktop layout on develop.
 */
export function RoadmapHeader() {
  return (
    <header className={ROADMAP_HEADER}>
      <div className={ROADMAP_HEADER_TITLE_ROW}>
        <div className="min-w-0">
          <h1
            data-roadmap-heading
            tabIndex={-1}
            className="text-display-sm font-semibold tracking-tight"
          >
            Product Roadmap
          </h1>
          <p className="text-label text-muted-foreground mt-1 tracking-tight">
            Signed bets, in order. Tickets live in Agent Workplace.
          </p>
        </div>
        <div className={ROADMAP_PHONE_NEW_BET}>
          <NewBetButton />
        </div>
      </div>
      <HeaderActions newBetClassName={ROADMAP_DESKTOP_NEW_BET} />
    </header>
  )
}
