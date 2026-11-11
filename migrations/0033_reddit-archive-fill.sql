CREATE TABLE `reddit_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`archive_fill` integer NOT NULL,
	CONSTRAINT "reddit_settings_is_one_row" CHECK("reddit_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `reddit_threads` ADD `archived_at` integer;