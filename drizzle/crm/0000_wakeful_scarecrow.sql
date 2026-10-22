CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"case_number" integer NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"contact_id" text NOT NULL,
	"gmail_thread_id" text,
	"last_activity_at" bigint,
	"last_inbound_at" bigint,
	"last_outbound_at" bigint,
	"closed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"name_source" text,
	"organization_id" text,
	"stripe_customer_id" text,
	"plan" text,
	"plan_status" text,
	"source" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"id" text PRIMARY KEY NOT NULL,
	"value" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"case_id" text,
	"triage_state" text,
	"direction" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" jsonb NOT NULL,
	"cc_emails" jsonb NOT NULL,
	"subject" text,
	"snippet" text,
	"body_text" text,
	"body_html" text,
	"attachments" jsonb NOT NULL,
	"sent_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ignored_senders" (
	"email" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expiry_date" integer,
	"scope" text,
	"account_email" text,
	"error_message" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_leases" (
	"source" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"message" text,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"source" text PRIMARY KEY NOT NULL,
	"cursor" text,
	"last_synced_at" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cases_case_number_unique" ON "cases" USING btree ("case_number");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_gmail_thread_id_unique" ON "cases" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_contact_id_idx" ON "cases" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "cases_last_activity_at_idx" ON "cases" USING btree ("last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_normalized_unique" ON "contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_stripe_customer_id_unique" ON "contacts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "contacts_organization_id_idx" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_gmail_message_id_unique" ON "email_messages" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE INDEX "email_messages_gmail_thread_id_idx" ON "email_messages" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE INDEX "email_messages_case_id_idx" ON "email_messages" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "email_messages_triage_state_idx" ON "email_messages" USING btree ("triage_state","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ignored_senders_email_normalized_unique" ON "ignored_senders" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "notes_case_id_idx" ON "notes" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_name_unique" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_domain_unique" ON "organizations" USING btree ("domain") WHERE "organizations"."domain" is not null;--> statement-breakpoint
CREATE INDEX "sync_runs_source_idx" ON "sync_runs" USING btree ("source","started_at");