CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`normalized_url` text NOT NULL,
	`original_url` text NOT NULL,
	`saved_at` integer NOT NULL,
	`title` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_normalized_url_unique` ON `items` (`normalized_url`);--> statement-breakpoint
CREATE INDEX `items_saved_at_id` ON `items` (`saved_at`,`id`);