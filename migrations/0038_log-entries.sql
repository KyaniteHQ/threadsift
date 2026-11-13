CREATE TABLE `log_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`title` text,
	`topic` text,
	`tags` text,
	`added` integer,
	`removed` integer,
	`picks` integer,
	`item_id` integer,
	`topic_id` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `log_entries_item` ON `log_entries` (`item_id`);--> statement-breakpoint
CREATE INDEX `log_entries_topic` ON `log_entries` (`topic_id`);--> statement-breakpoint
CREATE TABLE `log_start` (
	`id` integer PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	CONSTRAINT "log_start_is_one_row" CHECK("log_start"."id" = 1)
);

--> statement-breakpoint
CREATE TRIGGER `log_entries_action_insert` BEFORE INSERT ON `log_entries` WHEN NEW.action not in ('ingest', 'digest', 'topic', 'overview', 'related') BEGIN
	SELECT RAISE(ABORT, 'log_entries_action: a Log entry has a known action');
END;
--> statement-breakpoint
CREATE TRIGGER `log_entries_action_update` BEFORE UPDATE OF `action` ON `log_entries` WHEN NEW.action not in ('ingest', 'digest', 'topic', 'overview', 'related') BEGIN
	SELECT RAISE(ABORT, 'log_entries_action: a Log entry has a known action');
END;
--> statement-breakpoint
INSERT INTO `log_start` (`id`, `started_at`) VALUES (1, CAST(unixepoch('subsec') * 1000 AS integer));
