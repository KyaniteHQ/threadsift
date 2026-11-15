ALTER TABLE `reddit_account` ADD `refused_threads` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `reddit_account` ADD `refusals_cleared_at` integer;