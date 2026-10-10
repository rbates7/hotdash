import { describe, expect, it } from "vitest"

import { TEXT_SIZES, cn } from "@/lib/utils"

describe("cn() knows the role-named type scale", () => {
  it.each(TEXT_SIZES)("keeps text-%s beside a text colour", (size) => {
    const out = cn(`text-${size}`, "text-amber-900")
    expect(out.split(" ")).toEqual(expect.arrayContaining([`text-${size}`, "text-amber-900"]))
    // Order does not matter either.
    expect(cn("text-muted-foreground", `text-${size}`).split(" ")).toEqual(
      expect.arrayContaining([`text-${size}`, "text-muted-foreground"])
    )
  })

  it("still lets a later size override an earlier one, and a later colour an earlier colour", () => {
    expect(cn("text-micro", "text-caption")).toBe("text-caption")
    expect(cn("text-amber-900", "text-foreground")).toBe("text-foreground")
    expect(cn("text-xs", "text-micro")).toBe("text-micro")
  })

  it("keeps the full sample-data recipe intact", () => {
    const out = cn(
      "text-micro inline-flex rounded-full border",
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
      "text-caption h-6"
    ).split(" ")
    expect(out).toEqual(
      expect.arrayContaining(["text-caption", "text-amber-900", "dark:text-amber-200", "border-amber-300", "h-6"])
    )
    expect(out).not.toContain("text-micro")
  })
})
