CREATE TABLE `digests` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`task_id` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`generation` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `items` ADD `generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `digest_failed` integer DEFAULT false NOT NULL;