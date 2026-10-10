import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { bugs } from "@/lib/bugs"
import { formatRelative } from "@/lib/clock"
import { STATUS_CONFIG, actorById } from "@/lib/issues"
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

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

describe("BugsList row accessible name", () => {
  it("B2: every seed card's link name carries its title, then its status, then its key", () => {
    renderList()
    const seed = bugs(buildIssues(FIXED_NOW))
    expect(seed.length).toBeGreaterThanOrEqual(4)
    for (const issue of seed) {
      const status = STATUS_CONFIG[issue.status].label
      const card = screen.getByRole("link", {
        name: new RegExp(`${escape(issue.title)}\\s*, status ${escape(status)}\\s*${escape(issue.key)}(?!\\d)`),
      })
      expect(card).toHaveAttribute("href", bugHref(issue.key))
    }
  })

  it("F6: says the assignee once, keeping the agent marker for agents", () => {
    renderList()
    for (const issue of bugs(buildIssues(FIXED_NOW))) {
      const assignee = actorById(actors, issue.assigneeId)
      const card = screen.getByRole("link", { name: new RegExp(`${escape(issue.key)}(?!\\d)`) })
      if (!assignee) continue
      const name = computeName(card)
      const said = name.split(assignee.name).length - 1
      expect(said, `${issue.key}: "${name}"`).toBe(1)
      if (assignee.kind === "agent") expect(name).toContain(`${assignee.name} (agent)`)
      else expect(name).not.toContain("(agent)")
      // The initials disc is decoration once the name is visible.
      if (assignee.kind === "human")
        expect(name).not.toMatch(new RegExp(`${escape(assignee.initials)}\\s*${escape(assignee.name)}`))
    }
  })
})

/** The link's text as a screen reader gets it: aria-hidden subtrees dropped. */
function computeName(el: Element): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
    if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return ""
    return Array.from(node.childNodes).map(walk).join("")
  }
  return walk(el).replace(/\s+/g, " ").trim()
}
