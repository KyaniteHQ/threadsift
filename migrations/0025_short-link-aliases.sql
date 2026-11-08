CREATE TABLE `item_aliases` (
	`normalized_url` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`item_id` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_aliases_item` ON `item_aliases` (`item_id`);