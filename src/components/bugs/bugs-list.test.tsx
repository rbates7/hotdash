import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { formatRelative } from "@/lib/clock"
import { actors, buildIssues } from "@/lib/issues-fixture"
import { FIXED_NOW } from "@/test/clock"
import { BugsList, bugHref } from "@/components/bugs/bugs-list"

function renderList() {
  return render(<BugsList issues={buildIssues(FIXED_NOW)} actors={actors} now={FIXED_NOW} />)
}

describe("BugsList row (phone card)", () => {
  it("is a link to the ticket carrying tag, title, key · priority · assignee, age and a chevron", () => {
    renderList()
    const card = screen.getByRole("link", { name: /Crash opening a shared playbook on iPad/ })
    expect(card).toHaveAttribute("href", bugHref("CHLK-419"))
    expect(card).toHaveAttribute("href", "/bugs?issue=CHLK-419")

    expect(within(card).getByTestId("bug-tag")).toHaveTextContent("Bug · Crash")
    expect(within(card).getByText("Crash opening a shared playbook on iPad")).toBeInTheDocument()
    expect(within(card).getByText("CHLK-419")).toBeInTheDocument()
    expect(within(card).getByText("Urgent")).toBeInTheDocument()
    expect(within(card).getAllByText("Yo-Yo").length).toBeGreaterThan(0)

    const seed = buildIssues(FIXED_NOW).find((i) => i.key === "CHLK-419")!
    expect(within(card).getByTestId("bug-age")).toHaveTextContent(
      formatRelative(Date.parse(seed.createdAt), FIXED_NOW.getTime())
    )

    // Chevron is decorative and only shown below md.
    const chevron = within(card).getByTestId("bug-chevron")
    expect(chevron).toHaveAttribute("aria-hidden", "true")
    expect(chevron).toHaveClass("md:hidden")
  })

  it("places tag and age on the first row and the title block under them on phone", () => {
    renderList()
    const card = screen.getByRole("link", { name: /Crash opening a shared playbook on iPad/ })
    expect(card).toHaveClass("max-md:grid")
    expect(within(card).getByTestId("bug-tag")).toHaveClass("max-md:row-start-1", "max-md:col-start-1")
    expect(within(card).getByTestId("bug-age")).toHaveClass("max-md:row-start-1", "max-md:col-start-2")
    expect(within(card).getByText("Crash opening a shared playbook on iPad").parentElement).toHaveClass(
      "max-md:row-start-2"
    )
  })
})
