ALTER TABLE `contacts` ADD `organization_source` text;--> statement-breakpoint
-- Every link that exists at the time this column arrives was made by the
-- Supabase sync (Stripe never links accounts; the manual path had not been
-- used). Attributing them lets the next sync take back the ones it made from
-- a typed-in school name rather than a real staff seat.
UPDATE `contacts` SET `organization_source` = 'supabase' WHERE `organization_id` IS NOT NULL AND `organization_source` IS NULL;
