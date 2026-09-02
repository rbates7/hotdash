ALTER TABLE `email_messages` ADD `contact_id` text REFERENCES contacts(id);--> statement-breakpoint
CREATE INDEX `email_messages_contact_id_idx` ON `email_messages` (`contact_id`,`sent_at`);--> statement-breakpoint
-- Every message already on a case is with that case's person.
UPDATE `email_messages` SET `contact_id` = (SELECT `contact_id` FROM `cases` WHERE `cases`.`id` = `email_messages`.`case_id`) WHERE `case_id` IS NOT NULL AND `contact_id` IS NULL;
