import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SampleDataNotice, SampleDataStrip, SampleDataTag } from "@/components/sample-data"

const classes = (el: Element) => el.className.split(/\s+/)

describe("sample-data surfaces keep both their size and their colour through cn()", () => {
  it("SampleDataTag: text-micro and the amber pair both survive", () => {
    render(<SampleDataTag />)
    const tag = screen.getByTestId("sample-data-tag")
    expect(classes(tag)).toEqual(expect.arrayContaining(["text-micro", "text-amber-900", "dark:text-amber-200", "bg-amber-100"]))
  })

  it("a caller's size override replaces the size without touching the colour", () => {
    render(<SampleDataTag className="text-caption h-6 px-2" />)
    const tag = screen.getByTestId("sample-data-tag")
    const c = classes(tag)
    expect(c).toContain("text-caption")
    expect(c).not.toContain("text-micro")
    expect(c).toEqual(expect.arrayContaining(["text-amber-900", "dark:text-amber-200"]))
  })

  it("notice and strip keep size and colour too", () => {
    render(
      <>
        <SampleDataNotice />
        <SampleDataStrip>Illustrative rows.</SampleDataStrip>
      </>
    )
    expect(classes(screen.getByTestId("sample-data-notice"))).toEqual(expect.arrayContaining(["text-body", "text-amber-900"]))
    expect(classes(screen.getByTestId("sample-data-strip"))).toEqual(expect.arrayContaining(["text-caption", "text-amber-900"]))
  })
})
