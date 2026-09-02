import { relations } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

// Column conventions keep a Postgres escape hatch open: text UUID ids,
// timestamp_ms integers set in app code, JSON as text, emails lowercased in
// app code rather than via collations.

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("organizations_name_unique").on(table.name)]
)

export const NAME_SOURCES = ["gmail", "stripe", "supabase", "manual"] as const
export type NameSource = (typeof NAME_SOURCES)[number]

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    nameSource: text("name_source", { enum: NAME_SOURCES }),
    organizationId: text("organization_id").references(() => organizations.id),
    // Who made the link. A sync may change or remove a link it made itself
    // when its definition of "team" changes upstream; a hand-made link is
    // never touched by a sync.
    organizationSource: text("organization_source", { enum: NAME_SOURCES }),
    stripeCustomerId: text("stripe_customer_id"),
    plan: text("plan"),
    planStatus: text("plan_status"),
    // Subscription dates, from Stripe. Started is when paying began — the
    // end of the trial when there was one, so a trialing customer has a
    // start in the future. Ended is when the plan actually stopped; a
    // pending cancel-at-period-end is still paying and has no end yet.
    planStartedAt: integer("plan_started_at", { mode: "timestamp_ms" }),
    planEndedAt: integer("plan_ended_at", { mode: "timestamp_ms" }),
    // Product usage, mirrored from the Chlk app database by the Supabase
    // sync. appProfile carries whatever extra columns the mapping selects,
    // so unknown fields still surface on the customer profile.
    appUserId: text("app_user_id"),
    signupAt: integer("signup_at", { mode: "timestamp_ms" }),
    lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" }),
    appProfile: text("app_profile", { mode: "json" }).$type<
      Record<string, string | number | boolean | null>
    >(),
    // The school or team someone typed into their Chlk profile. Not an
    // account: it never links anyone to an organization. It has its own
    // column (the profile card reads the same value from appProfile) so
    // that coaches who typed the same school can be grouped in SQL.
    affiliation: text("affiliation"),
    // When you ticked "reached out" on the Overview's new / churned lists.
    reachedOutAt: integer("reached_out_at", { mode: "timestamp_ms" }),
    source: text("source", {
      enum: ["gmail", "stripe", "supabase", "manual"],
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("contacts_email_unique").on(table.email),
    uniqueIndex("contacts_stripe_customer_id_unique").on(
      table.stripeCustomerId
    ),
    index("contacts_organization_id_idx").on(table.organizationId),
    index("contacts_plan_started_at_idx").on(table.planStartedAt),
    index("contacts_plan_ended_at_idx").on(table.planEndedAt),
  ]
)

/** Additional addresses that resolve to a contact, learned when a triage
 * thread is linked by hand. The contact's primary address lives on
 * `contacts.email`; this covers the rest. */
export const contactEmails = sqliteTable(
  "contact_emails",
  {
    email: text("email").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("contact_emails_contact_id_idx").on(table.contactId)]
)

export const CASE_STATUSES = ["new", "open", "waiting", "closed"] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export type CasePriority = (typeof CASE_PRIORITIES)[number]

export const cases = sqliteTable(
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
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    lastInboundAt: integer("last_inbound_at", { mode: "timestamp_ms" }),
    lastOutboundAt: integer("last_outbound_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("cases_case_number_unique").on(table.caseNumber),
    uniqueIndex("cases_gmail_thread_id_unique").on(table.gmailThreadId),
    index("cases_status_idx").on(table.status),
    index("cases_contact_id_idx").on(table.contactId),
    index("cases_last_activity_at_idx").on(table.lastActivityAt),
  ]
)

export const MESSAGE_CHANNELS = ["email", "feedback"] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

export const emailMessages = sqliteTable(
  "email_messages",
  {
    id: text("id").primaryKey(),
    // Feedback sent from inside the Chlk app is stored here too, so it runs
    // through the same case machinery as email. Those rows carry a
    // synthetic "feedback:<id>" in both gmail columns and no HTML body.
    channel: text("channel", { enum: MESSAGE_CHANNELS })
      .notNull()
      .default("email"),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    // caseId NULL + triageState "pending" is the triage queue; promotion is
    // an UPDATE that fills caseId and clears triageState.
    caseId: text("case_id").references(() => cases.id),
    // The person this message is with: the case's contact for a message on
    // a case, or the recipient of mail you started to someone the CRM
    // knows, which has no case until they reply. "Last emailed" and the
    // auto-filled "reached out" tick read from it.
    contactId: text("contact_id").references(() => contacts.id),
    triageState: text("triage_state", { enum: ["pending", "ignored"] }),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails", { mode: "json" }).$type<string[]>().notNull(),
    ccEmails: text("cc_emails", { mode: "json" }).$type<string[]>().notNull(),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    attachments: text("attachments", { mode: "json" })
      .$type<{ filename: string; mimeType: string; size: number }[]>()
      .notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("email_messages_gmail_message_id_unique").on(
      table.gmailMessageId
    ),
    index("email_messages_gmail_thread_id_idx").on(table.gmailThreadId),
    index("email_messages_case_id_idx").on(table.caseId),
    index("email_messages_contact_id_idx").on(table.contactId, table.sentAt),
    index("email_messages_triage_state_idx").on(
      table.triageState,
      table.sentAt
    ),
  ]
)

export const NOTE_KINDS = ["user", "system", "call"] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    // A note hangs off a case or straight off a customer — exactly one of
    // caseId / contactId is set. Case notes are what you keep while working
    // one conversation; customer notes and logged calls are what you know
    // about the person regardless of any case.
    caseId: text("case_id").references(() => cases.id),
    contactId: text("contact_id").references(() => contacts.id),
    // System notes double as the case's audit trail. A call is a note you
    // wrote after speaking with someone, dated when the call happened.
    kind: text("kind", { enum: NOTE_KINDS }).notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("notes_case_id_idx").on(table.caseId, table.createdAt),
    index("notes_contact_id_idx").on(table.contactId, table.createdAt),
  ]
)

export const oauthTokens = sqliteTable("oauth_tokens", {
  provider: text("provider").primaryKey(),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiryDate: integer("expiry_date"),
  scope: text("scope"),
  accountEmail: text("account_email"),
  errorMessage: text("error_message"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const SYNC_SOURCES = ["gmail", "stripe", "supabase", "feedback"] as const
export type SyncSource = (typeof SYNC_SOURCES)[number]

export const syncState = sqliteTable("sync_state", {
  source: text("source", { enum: SYNC_SOURCES }).primaryKey(),
  cursor: text("cursor"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: SYNC_SOURCES }).notNull(),
    trigger: text("trigger", { enum: ["interval", "manual"] }).notNull(),
    status: text("status", {
      enum: ["running", "success", "error", "skipped"],
    }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    message: text("message"),
    stats: text("stats", { mode: "json" }).$type<Record<string, number>>(),
  },
  (table) => [index("sync_runs_source_idx").on(table.source, table.startedAt)]
)

export const counters = sqliteTable("counters", {
  id: text("id").primaryKey(),
  value: integer("value").notNull(),
})

export const ignoredSenders = sqliteTable("ignored_senders", {
  email: text("email").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
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
  notes: many(notes),
  messages: many(emailMessages),
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
  contact: one(contacts, {
    fields: [emailMessages.contactId],
    references: [contacts.id],
  }),
}))

export const notesRelations = relations(notes, ({ one }) => ({
  case: one(cases, {
    fields: [notes.caseId],
    references: [cases.id],
  }),
  contact: one(contacts, {
    fields: [notes.contactId],
    references: [contacts.id],
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
