import { z } from "zod"

import { contactDisplayName, createContact, findContactByEmail, findOrCreateOrganizationByName, listContacts } from "@/lib/contacts/server"
import { ConflictError } from "@/lib/core/errors"
import { jsonError } from "@/lib/core/http"
import { getDb } from "@/lib/db/client"

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
    const body = createSchema.parse(await request.json())
    const db = getDb()
    if (findContactByEmail(db, body.email)) {
      throw new ConflictError("A contact with that email already exists.")
    }
    const organizationId = body.organizationName?.trim()
      ? findOrCreateOrganizationByName(db, body.organizationName).id
      : null
    const contact = createContact(db, {
      email: body.email,
      firstName: body.firstName?.trim() || null,
      lastName: body.lastName?.trim() || null,
      nameSource: body.firstName || body.lastName ? "manual" : null,
      organizationId,
      source: "manual",
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
