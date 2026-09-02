PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text,
	`contact_id` text,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- drizzle-kit wrote this SELECT against the *new* column list; the old
-- table has no contact_id, so every existing note is a case note.
INSERT INTO `__new_notes`("id", "case_id", "contact_id", "kind", "body", "created_at") SELECT "id", "case_id", NULL, "kind", "body", "created_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notes_case_id_idx` ON `notes` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notes_contact_id_idx` ON `notes` (`contact_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `contacts` ADD `plan_started_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `plan_ended_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `affiliation` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `reached_out_at` integer;--> statement-breakpoint
CREATE INDEX `contacts_plan_started_at_idx` ON `contacts` (`plan_started_at`);--> statement-breakpoint
CREATE INDEX `contacts_plan_ended_at_idx` ON `contacts` (`plan_ended_at`);--> statement-breakpoint
ALTER TABLE `email_messages` ADD `channel` text DEFAULT 'email' NOT NULL;--> statement-breakpoint
-- The school someone typed into their Chlk profile has been arriving in
-- app_profile since the Supabase sync went live. Lift it into its own
-- column so the next sync has nothing to redo and prospects can be grouped
-- straight away.
UPDATE `contacts` SET `affiliation` = nullif(trim(json_extract(`app_profile`, '$.affiliation')), '') WHERE `affiliation` IS NULL AND `app_profile` IS NOT NULL AND json_valid(`app_profile`);
