import { relations, sql } from "drizzle-orm"
import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"

// Keep the donor's millisecond representation in Postgres while exposing
// Dates to the domain/UI, avoiding timezone and product behavior changes.
const timestampMs = customType<{ data: Date; driverData: string }>({
  dataType() {
    return "bigint"
  },
  toDriver(value) {
    return String(value.getTime())
  },
  fromDriver(value) {
    return new Date(Number(value))
  },
})

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("organizations_name_unique").on(table.name),
    uniqueIndex("organizations_domain_unique")
      .on(sql`lower(${table.domain})`)
      .where(sql`${table.domain} is not null`),
  ]
)

export const NAME_SOURCES = ["gmail", "stripe", "supabase", "manual"] as const
export type NameSource = (typeof NAME_SOURCES)[number]

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    nameSource: text("name_source", { enum: NAME_SOURCES }),
    organizationId: text("organization_id").references(() => organizations.id),
    stripeCustomerId: text("stripe_customer_id"),
    plan: text("plan"),
    planStatus: text("plan_status"),
    source: text("source", { enum: ["gmail", "stripe", "manual"] }).notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("contacts_email_normalized_unique").on(sql`lower(${table.email})`),
    uniqueIndex("contacts_stripe_customer_id_unique").on(
      table.stripeCustomerId
    ),
    index("contacts_organization_id_idx").on(table.organizationId),
  ]
)

export const CASE_STATUSES = ["new", "open", "waiting", "closed"] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export type CasePriority = (typeof CASE_PRIORITIES)[number]

export const cases = pgTable(
  "cases",
  {
    id: text("id").primaryKey(),
    caseNumber: integer("case_number").notNull(),
    subject: text("subject").notNull(),
    status: text("status", { enum: CASE_STATUSES }).notNull().default("new"),
    priority: text("priority", { enum: CASE_PRIORITIES })
      .notNull()
      .default("normal"),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    gmailThreadId: text("gmail_thread_id"),
    lastActivityAt: timestampMs("last_activity_at"),
    lastInboundAt: timestampMs("last_inbound_at"),
    lastOutboundAt: timestampMs("last_outbound_at"),
    closedAt: timestampMs("closed_at"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("cases_case_number_unique").on(table.caseNumber),
    uniqueIndex("cases_gmail_thread_id_unique").on(table.gmailThreadId),
    index("cases_status_idx").on(table.status),
    index("cases_contact_id_idx").on(table.contactId),
    index("cases_last_activity_at_idx").on(table.lastActivityAt),
  ]
)

export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey(),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    // caseId NULL + triageState "pending" is the triage queue; promotion is
    // an UPDATE that fills caseId and clears triageState.
    caseId: text("case_id").references(() => cases.id),
    triageState: text("triage_state", { enum: ["pending", "ignored"] }),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: jsonb("to_emails").$type<string[]>().notNull(),
    ccEmails: jsonb("cc_emails").$type<string[]>().notNull(),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    attachments: jsonb("attachments")
      .$type<{ filename: string; mimeType: string; size: number }[]>()
      .notNull(),
    sentAt: timestampMs("sent_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("email_messages_gmail_message_id_unique").on(
      table.gmailMessageId
    ),
    index("email_messages_gmail_thread_id_idx").on(table.gmailThreadId),
    index("email_messages_case_id_idx").on(table.caseId),
    index("email_messages_triage_state_idx").on(
      table.triageState,
      table.sentAt
    ),
  ]
)

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id),
    // System notes double as the case's audit trail.
    kind: text("kind", { enum: ["user", "system"] }).notNull(),
    body: text("body").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => [index("notes_case_id_idx").on(table.caseId, table.createdAt)]
)

export const oauthTokens = pgTable("oauth_tokens", {
  provider: text("provider").primaryKey(),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiryDate: bigint("expiry_date", { mode: "number" }),
  scope: text("scope"),
  accountEmail: text("account_email"),
  errorMessage: text("error_message"),
  updatedAt: timestampMs("updated_at").notNull(),
})

export const SYNC_SOURCES = ["gmail", "stripe", "supabase"] as const
export type SyncSource = (typeof SYNC_SOURCES)[number]

export const syncState = pgTable("sync_state", {
  source: text("source", { enum: SYNC_SOURCES }).primaryKey(),
  cursor: text("cursor"),
  lastSyncedAt: timestampMs("last_synced_at"),
  updatedAt: timestampMs("updated_at").notNull(),
})

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: SYNC_SOURCES }).notNull(),
    trigger: text("trigger", { enum: ["interval", "manual"] }).notNull(),
    status: text("status", {
      enum: ["running", "success", "error", "skipped"],
    }).notNull(),
    startedAt: timestampMs("started_at").notNull(),
    finishedAt: timestampMs("finished_at"),
    message: text("message"),
    stats: jsonb("stats").$type<Record<string, number>>(),
  },
  (table) => [index("sync_runs_source_idx").on(table.source, table.startedAt)]
)

export const counters = pgTable("counters", {
  id: text("id").primaryKey(),
  value: bigint("value", { mode: "number" }).notNull(),
})

export const ignoredSenders = pgTable(
  "ignored_senders",
  {
    email: text("email").primaryKey(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ignored_senders_email_normalized_unique").on(
      sql`lower(${table.email})`
    ),
  ]
)

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export const syncLeases = pgTable("sync_leases", {
  source: text("source", { enum: SYNC_SOURCES }).primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: timestampMs("expires_at").notNull(),
  updatedAt: timestampMs("updated_at").notNull(),
})

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
}))

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
  cases: many(cases),
}))

export const casesRelations = relations(cases, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [cases.contactId],
    references: [contacts.id],
  }),
  messages: many(emailMessages),
  notes: many(notes),
}))

export const emailMessagesRelations = relations(emailMessages, ({ one }) => ({
  case: one(cases, {
    fields: [emailMessages.caseId],
    references: [cases.id],
  }),
}))

export const notesRelations = relations(notes, ({ one }) => ({
  case: one(cases, {
    fields: [notes.caseId],
    references: [cases.id],
  }),
}))

export type Organization = typeof organizations.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type Case = typeof cases.$inferSelect
export type EmailMessage = typeof emailMessages.$inferSelect
export type Note = typeof notes.$inferSelect
export type OauthTokenRow = typeof oauthTokens.$inferSelect
export type SyncStateRow = typeof syncState.$inferSelect
export type SyncRun = typeof syncRuns.$inferSelect
