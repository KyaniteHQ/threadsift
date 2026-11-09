CREATE TABLE `highlights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`comment_id` text,
	`exact` text NOT NULL,
	`prefix` text NOT NULL,
	`suffix` text NOT NULL,
	`hint` integer NOT NULL,
	`projection` integer NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`start` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "highlights_start_when_attached" CHECK(("highlights"."status" = 'attached') = ("highlights"."start" is not null))
);
--> statement-breakpoint
CREATE INDEX `highlights_item` ON `highlights` (`item_id`);--> statement-breakpoint
ALTER TABLE `search_parts` ADD `highlight_id` integer REFERENCES highlights(id);--> statement-breakpoint
CREATE UNIQUE INDEX `search_parts_highlight` ON `search_parts` (`highlight_id`);