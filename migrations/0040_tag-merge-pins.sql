CREATE TABLE `pins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`from_key` text NOT NULL,
	`from_name` text NOT NULL,
	`into_tag_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pins_kind_key` ON `pins` (`kind`,`from_key`);--> statement-breakpoint
CREATE INDEX `pins_into` ON `pins` (`into_tag_id`);--> statement-breakpoint
ALTER TABLE `log_entries` ADD `merged_from` text;--> statement-breakpoint
ALTER TABLE `log_entries` ADD `merged_into` text;--> statement-breakpoint
ALTER TABLE `log_entries` ADD `moved` integer;--> statement-breakpoint
DROP TRIGGER `log_entries_action_insert`;
--> statement-breakpoint
DROP TRIGGER `log_entries_action_update`;
--> statement-breakpoint
CREATE TRIGGER `log_entries_action_insert` BEFORE INSERT ON `log_entries` WHEN NEW.action not in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge') BEGIN
	SELECT RAISE(ABORT, 'log_entries_action: a Log entry has a known action');
END;
--> statement-breakpoint
CREATE TRIGGER `log_entries_action_update` BEFORE UPDATE OF `action` ON `log_entries` WHEN NEW.action not in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge') BEGIN
	SELECT RAISE(ABORT, 'log_entries_action: a Log entry has a known action');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_values_insert` BEFORE INSERT ON `pins` WHEN NEW.kind not in ('tag-merge') BEGIN
	SELECT RAISE(ABORT, 'pins_values: a Pin has a known kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_values_update` BEFORE UPDATE OF `kind` ON `pins` WHEN NEW.kind not in ('tag-merge') BEGIN
	SELECT RAISE(ABORT, 'pins_values: a Pin has a known kind');
END;
