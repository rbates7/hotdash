import { z } from "zod"

import { contactDisplayName, createContact, findContactByEmail, findOrCreateOrganizationByName, listContacts } from "@/lib/crm/contacts/server"
import { ConflictError } from "@/lib/crm/core/errors"
import { jsonError, refuseCrossSite } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  email: z.email(),
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  organizationName: z.string().max(200).optional(),
})

export async function POST(request: Request) {
  try {
    const refused = refuseCrossSite(request)
    if (refused) return refused
    const body = createSchema.parse(await request.json())
    const db = getDb()
    const contact = await db.transaction(async (tx) => {
      if (await findContactByEmail(tx, body.email)) {
        throw new ConflictError("A contact with that email already exists.")
      }
      const organizationId = body.organizationName?.trim()
        ? (await findOrCreateOrganizationByName(tx, body.organizationName)).id
        : null
      return createContact(tx, {
        email: body.email,
        firstName: body.firstName?.trim() || null,
        lastName: body.lastName?.trim() || null,
        nameSource: body.firstName || body.lastName ? "manual" : null,
        organizationId,
        source: "manual",
      })
    })
    return Response.json({ contact })
  } catch (error) {
    return jsonError(error, "Failed to create the contact.")
  }
}

const querySchema = z.object({ q: z.string().max(200).optional() })

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const { q } = querySchema.parse(Object.fromEntries(searchParams))
    const rows = await listContacts(getDb(), { q })
    return Response.json({
      contacts: rows.map((row) => ({
        id: row.contact.id,
        email: row.contact.email,
        name: contactDisplayName(row.contact),
        organization: row.organization?.name ?? null,
      })),
    })
  } catch (error) {
    return jsonError(error, "Failed to list contacts.")
  }
}
