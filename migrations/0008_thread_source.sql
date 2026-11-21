CREATE UNIQUE INDEX `items_id_source` ON `items` (`id`,`source`);--> statement-breakpoint
CREATE TABLE `__new_reddit_comments` (
	`item_id` integer NOT NULL,
	`source` text NOT NULL,
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
	FOREIGN KEY (`item_id`,`source`) REFERENCES `items`(`id`,`source`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reddit_comments_source_check" CHECK("__new_reddit_comments"."source" in ('reddit', 'x'))
);
--> statement-breakpoint
INSERT INTO `__new_reddit_comments`("item_id", "source", "generation", "position", "id", "parent_id", "depth", "kind", "author", "body", "score", "posted_at", "eligible", "kept") SELECT c."item_id", i."source", c."generation", c."position", c."id", c."parent_id", c."depth", c."kind", c."author", c."body", c."score", c."posted_at", c."eligible", c."kept" FROM `reddit_comments` AS c LEFT JOIN `items` AS i ON i."id" = c."item_id";--> statement-breakpoint
DROP TABLE `reddit_comments`;--> statement-breakpoint
ALTER TABLE `__new_reddit_comments` RENAME TO `reddit_comments`;--> statement-breakpoint
CREATE UNIQUE INDEX `reddit_comments_id` ON `reddit_comments` (`item_id`,`generation`,`id`);--> statement-breakpoint
CREATE TABLE `__new_reddit_threads` (
	`item_id` integer NOT NULL,
	`source` text NOT NULL,
	`generation` integer NOT NULL,
	`reported` integer,
	`archived_at` integer,
	`linked_url` text,
	`post_link` text,
	`follow_ups` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `generation`),
	FOREIGN KEY (`item_id`,`source`) REFERENCES `items`(`id`,`source`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reddit_threads_source_check" CHECK("__new_reddit_threads"."source" in ('reddit', 'x'))
);
--> statement-breakpoint
INSERT INTO `__new_reddit_threads`("item_id", "source", "generation", "reported", "archived_at", "linked_url", "post_link", "follow_ups") SELECT t."item_id", i."source", t."generation", t."reported", t."archived_at", t."linked_url", t."post_link", t."follow_ups" FROM `reddit_threads` AS t LEFT JOIN `items` AS i ON i."id" = t."item_id";--> statement-breakpoint
DROP TABLE `reddit_threads`;--> statement-breakpoint
ALTER TABLE `__new_reddit_threads` RENAME TO `reddit_threads`;