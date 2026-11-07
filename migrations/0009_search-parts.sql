CREATE TABLE `search_fingerprints` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_parts_item` ON `search_parts` (`item_id`);--> statement-breakpoint
CREATE TABLE `search_reconciling` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_item_id` integer NOT NULL,
	CONSTRAINT "search_reconciling_is_one_row" CHECK("search_reconciling"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `items` ADD `read_state` text DEFAULT 'unread' NOT NULL;