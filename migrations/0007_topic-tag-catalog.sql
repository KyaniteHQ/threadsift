CREATE TABLE `catalog_version` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "catalog_is_one_row" CHECK("catalog_version"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_tags_item_tag` ON `item_tags` (`item_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `item_tags_tag` ON `item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_key_unique` ON `tags` (`key`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_key_unique` ON `topics` (`key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_digests` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`task_id` integer NOT NULL,
	`provider` text,
	`model` text,
	`generation` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_digests`("item_id", "digest", "title", "topic", "task_id", "provider", "model", "generation", "created_at") SELECT "item_id", "digest", "title", "topic", "task_id", "provider", "model", "generation", "created_at" FROM `digests`;--> statement-breakpoint
DROP TABLE `digests`;--> statement-breakpoint
ALTER TABLE `__new_digests` RENAME TO `digests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `items` ADD `pending_digest` text;--> statement-breakpoint
ALTER TABLE `items` ADD `topic_id` integer REFERENCES topics(id);--> statement-breakpoint
CREATE INDEX `items_topic` ON `items` (`topic_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `stale_requeues` integer DEFAULT 0 NOT NULL;