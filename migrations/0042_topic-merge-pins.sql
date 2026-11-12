PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`from_key` text NOT NULL,
	`from_name` text NOT NULL,
	`into_tag_id` integer,
	`into_topic_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`into_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pins`("id", "kind", "from_key", "from_name", "into_tag_id", "created_at") SELECT "id", "kind", "from_key", "from_name", "into_tag_id", "created_at" FROM `pins`;--> statement-breakpoint
INSERT INTO `__new_pins`(`id`, `kind`, `from_key`, `from_name`, `created_at`) SELECT `seq`, 'tag-merge', '', '', 0 FROM `sqlite_sequence` WHERE `name` = 'pins' AND `seq` > (SELECT coalesce(max(`id`), 0) FROM `__new_pins`);--> statement-breakpoint
DELETE FROM `__new_pins` WHERE `into_tag_id` IS NULL;--> statement-breakpoint
DROP TABLE `pins`;--> statement-breakpoint
ALTER TABLE `__new_pins` RENAME TO `pins`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `pins_kind_key` ON `pins` (`kind`,`from_key`);--> statement-breakpoint
CREATE INDEX `pins_into` ON `pins` (`into_tag_id`);--> statement-breakpoint
CREATE INDEX `pins_into_topic` ON `pins` (`into_topic_id`);--> statement-breakpoint
CREATE TRIGGER `pins_values_insert` BEFORE INSERT ON `pins` WHEN NEW.kind not in ('tag-merge', 'topic-merge') BEGIN
	SELECT RAISE(ABORT, 'pins_values: a Pin has a known kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_values_update` BEFORE UPDATE OF `kind` ON `pins` WHEN NEW.kind not in ('tag-merge', 'topic-merge') BEGIN
	SELECT RAISE(ABORT, 'pins_values: a Pin has a known kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_subject_insert` BEFORE INSERT ON `pins` WHEN (NEW.kind = 'tag-merge' and not (NEW.into_tag_id is not null and NEW.into_topic_id is null)) or (NEW.kind = 'topic-merge' and not (NEW.into_topic_id is not null and NEW.into_tag_id is null)) BEGIN
	SELECT RAISE(ABORT, 'pins_subject: a Pin names the target of its kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_subject_update` BEFORE UPDATE OF `kind`, `into_tag_id`, `into_topic_id` ON `pins` WHEN (NEW.kind = 'tag-merge' and not (NEW.into_tag_id is not null and NEW.into_topic_id is null)) or (NEW.kind = 'topic-merge' and not (NEW.into_topic_id is not null and NEW.into_tag_id is null)) BEGIN
	SELECT RAISE(ABORT, 'pins_subject: a Pin names the target of its kind');
END;
