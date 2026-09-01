CREATE TABLE `contact_emails` (
	`email` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contact_emails_contact_id_idx` ON `contact_emails` (`contact_id`);