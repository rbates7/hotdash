import { describe, expect, it } from "vitest"

import { chlkMapping } from "./mapping"

describe("chlkMapping", () => {
  it("reads authoritative Chlk profiles and organization membership", () => {
    expect(chlkMapping.query).toContain("from chlk.profiles p")
    expect(chlkMapping.query).toContain(
      "left join chlk.organizations o on o.id = p.organization_id"
    )
    expect(chlkMapping.query).toContain("coalesce(o.name, p.organization)")
    expect(chlkMapping.query).toContain("where p.email is not null")
  })
})
