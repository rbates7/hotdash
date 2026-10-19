import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

import { configureRoadmapBoard } from "@/components/product-roadmap/roadmap-store"
import { configureGmailSummary } from "@/hooks/use-gmail-summary"
import { configureNotionRoadmap } from "@/hooks/use-notion-roadmap"
import { configurePosthogSummary } from "@/hooks/use-posthog-summary"
import { configureMrrCash } from "@/hooks/use-stripe-mrr-cash"
import { configureStripeSummary } from "@/hooks/use-stripe-summary"
import { GMAIL_NOT_CONNECTED } from "@/lib/crm/gmail-summary"
import { NOTION_NOT_CONNECTED } from "@/lib/notion-roadmap"
import { POSTHOG_NOT_CONNECTED } from "@/lib/posthog-summary"
import { MRR_CASH_NOT_CONNECTED } from "@/lib/stripe-mrr-cash"
import { NOT_CONNECTED } from "@/lib/stripe-summary"

// Stripe, PostHog and Gmail start not connected in every test (no fetch to
// a server that is not there): screens show their sample figures, labelled.
// A test that wants live figures configures them itself (see
// src/test/stripe.ts, src/test/posthog.ts and src/test/gmail.ts).
beforeEach(() => {
  configureStripeSummary({
    initial: { phase: "ready", summary: NOT_CONNECTED },
    fetcher: async () => NOT_CONNECTED,
  })
  configurePosthogSummary({
    initial: { phase: "ready", summary: POSTHOG_NOT_CONNECTED },
    fetcher: async () => POSTHOG_NOT_CONNECTED,
  })
  // Notion likewise: the Roadmap shows its local board under Not connected,
  // empty to start (a test that needs bets to edit hands it the fixture
  // with configureRoadmapBoard). See src/test/notion.ts for live rows.
  configureRoadmapBoard(null)
  configureNotionRoadmap({
    initial: { phase: "ready", summary: NOTION_NOT_CONNECTED },
    fetcher: async () => NOTION_NOT_CONNECTED,
  })
  configureMrrCash({ fetcher: async () => MRR_CASH_NOT_CONNECTED })
  // Gmail too: the CRM shows its labelled sample (src/test/gmail.ts for live).
  configureGmailSummary({
    initial: { phase: "ready", summary: GMAIL_NOT_CONNECTED },
    fetcher: async () => GMAIL_NOT_CONNECTED,
  })
})

afterEach(() => {
  cleanup()
  // Server-side suites (`@vitest-environment node`) have no window.
  if (typeof window !== "undefined") window.localStorage.clear()
})

// next/navigation needs an App Router context that jsdom does not provide.
// Tests that exercise URL state pass their own search params through this.
export const navigation = {
  push: vi.fn(),
  params: new URLSearchParams(),
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/agent-workplace",
}))

// Recharts' ResponsiveContainer measures itself with a ResizeObserver, which
// jsdom lacks, and warns about a 0×0 box. Give every chart a fixed box
// instead: the sparklines are 120×52 by design, and chart internals are not
// what component tests assert on.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  const React = await import("react")
  function ResponsiveContainer({
    children,
    initialDimension,
  }: {
    children: React.ReactNode
    initialDimension?: { width: number; height: number }
  }) {
    const width = initialDimension?.width ?? 120
    const height = initialDimension?.height ?? 52
    const child = React.Children.only(children) as React.ReactElement<{ width?: number; height?: number }>
    return React.createElement(
      "div",
      { className: "recharts-responsive-container", style: { width, height } },
      React.cloneElement(child, { width, height })
    )
  }
  return { ...actual, ResponsiveContainer }
})
