CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`case_number` integer NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`contact_id` text NOT NULL,
	`gmail_thread_id` text,
	`last_activity_at` integer,
	`last_inbound_at` integer,
	`last_outbound_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cases_case_number_unique` ON `cases` (`case_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `cases_gmail_thread_id_unique` ON `cases` (`gmail_thread_id`);--> statement-breakpoint
CREATE INDEX `cases_status_idx` ON `cases` (`status`);--> statement-breakpoint
CREATE INDEX `cases_contact_id_idx` ON `cases` (`contact_id`);--> statement-breakpoint
CREATE INDEX `cases_last_activity_at_idx` ON `cases` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`name_source` text,
	`organization_id` text,
	`stripe_customer_id` text,
	`plan` text,
	`plan_status` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email_unique` ON `contacts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_stripe_customer_id_unique` ON `contacts` (`stripe_customer_id`);--> statement-breakpoint
CREATE INDEX `contacts_organization_id_idx` ON `contacts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `counters` (
	`id` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`gmail_message_id` text NOT NULL,
	`gmail_thread_id` text NOT NULL,
	`case_id` text,
	`triage_state` text,
	`direction` text NOT NULL,
	`from_email` text NOT NULL,
	`from_name` text,
	`to_emails` text NOT NULL,
	`cc_emails` text NOT NULL,
	`subject` text,
	`snippet` text,
	`body_text` text,
	`body_html` text,
	`attachments` text NOT NULL,
	`sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_gmail_message_id_unique` ON `email_messages` (`gmail_message_id`);--> statement-breakpoint
CREATE INDEX `email_messages_gmail_thread_id_idx` ON `email_messages` (`gmail_thread_id`);--> statement-breakpoint
CREATE INDEX `email_messages_case_id_idx` ON `email_messages` (`case_id`);--> statement-breakpoint
CREATE INDEX `email_messages_triage_state_idx` ON `email_messages` (`triage_state`,`sent_at`);--> statement-breakpoint
CREATE TABLE `ignored_senders` (
	`email` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_case_id_idx` ON `notes` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`provider` text PRIMARY KEY NOT NULL,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`expiry_date` integer,
	`scope` text,
	`account_email` text,
	`error_message` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_name_unique` ON `organizations` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`message` text,
	`stats` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_source_idx` ON `sync_runs` (`source`,`started_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`last_synced_at` integer,
	`updated_at` integer NOT NULL
);
