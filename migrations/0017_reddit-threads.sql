CREATE TABLE `reddit_comments` (
	`item_id` integer NOT NULL,
	`generation` integer NOT NULL,
	`position` integer NOT NULL,
	`id` text NOT NULL,
	`parent_id` text,
	`depth` integer NOT NULL,
	`kind` text NOT NULL,
	`author` text,
	`body` text,
	`score` integer,
	`posted_at` integer,
	`eligible` integer NOT NULL,
	`kept` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`item_id`, `generation`, `position`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reddit_comments_id` ON `reddit_comments` (`item_id`,`generation`,`id`);--> statement-breakpoint
CREATE TABLE `reddit_threads` (
	`item_id` integer NOT NULL,
	`generation` integer NOT NULL,
	`reported` integer,
	PRIMARY KEY(`item_id`, `generation`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
