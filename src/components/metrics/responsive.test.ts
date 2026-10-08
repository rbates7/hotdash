import { describe, expect, it } from "vitest"

import {
  METRICS_DANGER,
  METRICS_DIALOG,
  METRICS_EXPENSE_PIN,
  METRICS_FIELD,
  METRICS_HEADER,
  METRICS_ICON,
  METRICS_PRESSED,
  METRICS_RESET,
  METRICS_SHEET,
  METRICS_SORT_HEAD,
  METRICS_TAB,
  METRICS_TABLIST,
  METRICS_TABS_FADE,
  METRICS_TEXTAREA,
  METRICS_TOUCH,
} from "@/components/metrics/responsive"

describe("Metrics responsive layout", () => {
  it("stacks the header on phone and grows Reset / actions below xl", () => {
    expect(METRICS_HEADER).toContain("max-md:flex-col")
    expect(METRICS_HEADER).toContain("justify-between")
    expect(METRICS_RESET).toBe("max-xl:h-11! max-xl:min-w-11!")
    expect(METRICS_TOUCH).toContain("max-xl:h-11!")
    expect(METRICS_TOUCH).toContain("max-xl:min-w-11!")
    expect(METRICS_ICON).toBe("max-xl:size-11!")
  })

  it("scrolls tabs with a peek fade and 44px inset-ring hits", () => {
    expect(METRICS_TABLIST).toContain("overflow-x-auto")
    expect(METRICS_TABLIST).toContain("max-xl:h-auto!")
    expect(METRICS_TABLIST).toContain("max-xl:overflow-y-hidden")
    expect(METRICS_TABS_FADE).toContain("from-background")
    expect(METRICS_TABS_FADE).toContain("max-md:block")
    expect(METRICS_TAB).toContain("max-xl:min-h-11!")
    expect(METRICS_TAB).toContain("max-xl:focus-visible:ring-inset")
  })

  it("presses toggles with solid primary at every width", () => {
    expect(METRICS_PRESSED).toContain("aria-pressed:bg-primary!")
    expect(METRICS_PRESSED).toContain("aria-pressed:text-primary-foreground!")
    expect(METRICS_PRESSED).not.toContain("max-xl:")
    expect(METRICS_PRESSED).not.toContain("xl:")
  })

  it("pins Expenses' first column on phone only, and leaves desktop overflow alone", () => {
    expect(METRICS_EXPENSE_PIN).toContain("max-md:[&_th:first-child]:sticky")
    expect(METRICS_EXPENSE_PIN).toContain("max-md:[&_td:first-child]:sticky")
    expect(METRICS_EXPENSE_PIN).toContain("max-md:[&_th:first-child]:bg-surface")
    expect(METRICS_EXPENSE_PIN).toContain("max-md:[&_td:first-child]:bg-surface")
    expect(METRICS_EXPENSE_PIN).toContain("max-md:[&_th:first-child]:shadow-[inset_-1px_0_0_var(--color-border)]")
    expect(METRICS_EXPENSE_PIN).toContain("max-md:[&_td:first-child]:shadow-[inset_-1px_0_0_var(--color-border)]")
    expect(METRICS_EXPENSE_PIN).toContain("xl:overflow-visible!")
    expect(METRICS_EXPENSE_PIN).not.toContain("bg-background")
    expect(METRICS_EXPENSE_PIN).not.toContain("xl:[&_th:first-child]:sticky")
    expect(METRICS_SORT_HEAD).toContain("max-xl:[&_button]:min-h-11!")
  })

  it("scopes sheet, fields, textarea and danger text to below 1280", () => {
    expect(METRICS_SHEET).toContain("rounded-t-2xl!")
    expect(METRICS_SHEET).toContain("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    expect(METRICS_DIALOG).toContain("max-xl:[&>[data-slot=dialog-close]]:size-11!")
    expect(METRICS_FIELD).toContain("max-xl:h-11!")
    expect(METRICS_FIELD).toContain("max-xl:text-base")
    expect(METRICS_TEXTAREA).toContain("max-xl:field-sizing-content")
    expect(METRICS_TEXTAREA).toContain("max-xl:min-h-24!")
    expect(METRICS_TEXTAREA).not.toMatch(/(?:^|\s)field-sizing-content/)
    expect(METRICS_TEXTAREA).not.toMatch(/(?:^|\s)min-h-/)
    expect(METRICS_TEXTAREA).not.toMatch(/(?:^|\s)h-/)
    expect(METRICS_DANGER).toBe("max-xl:text-danger-text!")
    expect(METRICS_DANGER).not.toMatch(/(?:^|\s)xl:text-danger/)
  })
})
