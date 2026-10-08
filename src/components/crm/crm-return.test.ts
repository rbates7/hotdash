import * as React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CRM_RETURN_KEY,
  backToList,
  clearListReturn,
  hasListReturn,
  rememberListReturn,
  useListReturn,
} from "@/components/crm/crm-return"

const at = (url: string) => window.history.replaceState(null, "", url)
const click = (extra: Partial<MouseEvent> = {}) => ({ preventDefault: vi.fn(), button: 0, ...extra })

describe("CRM list return (breadcrumb Back)", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    at("/crm/cases?status=open&priority=high")
  })
  afterEach(() => at("/"))

  it("records the list URL, query included, when a record is opened from the list", () => {
    rememberListReturn("/crm/cases/case-3")
    expect(JSON.parse(window.sessionStorage.getItem(CRM_RETURN_KEY)!)).toEqual({
      list: "/crm/cases",
      url: "/crm/cases?status=open&priority=high",
      detail: "/crm/cases/case-3",
    })
  })

  it("records nothing when not on a list", () => {
    at("/crm/contacts/contact-1")
    rememberListReturn("/crm/cases/case-3")
    expect(window.sessionStorage.getItem(CRM_RETURN_KEY)).toBeNull()
  })

  it("the breadcrumb steps back in history for the recorded record, then forgets it", () => {
    rememberListReturn("/crm/cases/case-3")
    at("/crm/cases/case-3")
    const back = vi.fn()
    const event = click()
    backToList(event, "/crm/cases", back)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(back).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem(CRM_RETURN_KEY)).toBeNull()
  })

  it("a deep link (nothing recorded) keeps the plain link", () => {
    at("/crm/cases/case-1")
    const back = vi.fn()
    const event = click()
    backToList(event, "/crm/cases", back)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it("a record for another page is stale: cleared, and the plain link is kept", () => {
    rememberListReturn("/crm/cases/case-3")
    at("/crm/cases/case-1")
    expect(hasListReturn("/crm/cases")).toBe(false)
    expect(window.sessionStorage.getItem(CRM_RETURN_KEY)).toBeNull()
  })

  it("a Contacts record does not drive the Cases breadcrumb", () => {
    at("/crm/contacts?q=hale")
    rememberListReturn("/crm/contacts/contact-1")
    at("/crm/contacts/contact-1")
    expect(hasListReturn("/crm/cases")).toBe(false)
    expect(hasListReturn("/crm/contacts")).toBe(true)
  })

  it("modified clicks (new tab) are left to the link", () => {
    rememberListReturn("/crm/cases/case-3")
    at("/crm/cases/case-3")
    const back = vi.fn()
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const event = click(extra)
      backToList(event, "/crm/cases", back)
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
    expect(back).not.toHaveBeenCalled()
    clearListReturn()
  })

  it("an unreadable entry counts as none", () => {
    window.sessionStorage.setItem(CRM_RETURN_KEY, "{not json")
    at("/crm/cases/case-3")
    expect(hasListReturn("/crm/cases")).toBe(false)
  })

  it("leaving the record for another page forgets the way back", async () => {
    rememberListReturn("/crm/cases/case-3")
    at("/crm/cases/case-3")
    const { unmount } = renderHook(() => useListReturn("/crm/cases", "/crm/cases/case-3"))
    expect(hasListReturn("/crm/cases")).toBe(true)
    at("/crm")
    unmount()
    await waitFor(() => expect(window.sessionStorage.getItem(CRM_RETURN_KEY)).toBeNull())
  })

  it("a development double-mount on the same page keeps it", async () => {
    rememberListReturn("/crm/cases/case-3")
    at("/crm/cases/case-3")
    renderHook(() => useListReturn("/crm/cases", "/crm/cases/case-3"), { wrapper: React.StrictMode })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(hasListReturn("/crm/cases")).toBe(true)
  })

  it("arriving on another record drops the stale entry", () => {
    rememberListReturn("/crm/cases/case-3")
    at("/crm/cases/case-1")
    renderHook(() => useListReturn("/crm/cases", "/crm/cases/case-1"))
    expect(window.sessionStorage.getItem(CRM_RETURN_KEY)).toBeNull()
  })
})
