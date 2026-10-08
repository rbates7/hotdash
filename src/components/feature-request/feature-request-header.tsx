"use client"

import { HeaderActions, NewIdeaButton } from "@/components/feature-request/header-actions"
import {
  FR_DESKTOP_NEW_IDEA,
  FR_HEADER,
  FR_HEADER_TITLE_ROW,
  FR_PHONE_NEW_IDEA,
} from "@/components/feature-request/responsive"

/**
 * Title, persistence note, sample tag, and New idea. On phone New idea sits
 * beside the title (Deke 13:1651); from `md` it stays in Page actions, which
 * is the desktop layout on develop.
 */
export function FeatureRequestHeader() {
  return (
    <header className={FR_HEADER}>
      <div className={FR_HEADER_TITLE_ROW}>
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">
            Feature Request
          </h1>
          <p className="text-label text-muted-foreground mt-1 tracking-tight">
            Dan&rsquo;s intake · funnels into Product Roadmap
          </p>
        </div>
        <div className={FR_PHONE_NEW_IDEA}>
          <NewIdeaButton />
        </div>
      </div>
      <HeaderActions newIdeaClassName={FR_DESKTOP_NEW_IDEA} />
    </header>
  )
}
