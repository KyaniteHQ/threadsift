ALTER TABLE `pins` ADD `from_item_id` integer REFERENCES items(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `pins` ADD `into_item_id` integer REFERENCES items(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `pins` ADD `from_digest` integer;
--> statement-breakpoint
ALTER TABLE `pins` ADD `into_digest` integer;
--> statement-breakpoint
CREATE INDEX `pins_from_item` ON `pins` (`from_item_id`);
--> statement-breakpoint
CREATE INDEX `pins_into_item` ON `pins` (`into_item_id`);
--> statement-breakpoint
DROP TRIGGER `pins_values_insert`;
--> statement-breakpoint
DROP TRIGGER `pins_values_update`;
--> statement-breakpoint
DROP TRIGGER `pins_subject_insert`;
--> statement-breakpoint
DROP TRIGGER `pins_subject_update`;
--> statement-breakpoint
CREATE TRIGGER `pins_values_insert` BEFORE INSERT ON `pins` WHEN NEW.kind not in ('tag-merge', 'topic-merge', 'items-disagree') BEGIN
	SELECT RAISE(ABORT, 'pins_values: a Pin has a known kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_values_update` BEFORE UPDATE OF `kind` ON `pins` WHEN NEW.kind not in ('tag-merge', 'topic-merge', 'items-disagree') BEGIN
	SELECT RAISE(ABORT, 'pins_values: a Pin has a known kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_subject_insert` BEFORE INSERT ON `pins` WHEN (NEW.kind = 'tag-merge' and not (NEW.into_tag_id is not null and NEW.into_topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'topic-merge' and not (NEW.into_topic_id is not null and NEW.into_tag_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'items-disagree' and not (NEW.into_tag_id is null and NEW.into_topic_id is null and NEW.from_item_id is not null and NEW.into_item_id is not null and NEW.from_digest is not null and NEW.into_digest is not null and NEW.from_item_id <> NEW.into_item_id)) BEGIN
	SELECT RAISE(ABORT, 'pins_subject: a Pin names the target of its kind');
END;
--> statement-breakpoint
CREATE TRIGGER `pins_subject_update` BEFORE UPDATE OF `kind`, `into_tag_id`, `into_topic_id`, `from_item_id`, `into_item_id`, `from_digest`, `into_digest` ON `pins` WHEN (NEW.kind = 'tag-merge' and not (NEW.into_tag_id is not null and NEW.into_topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'topic-merge' and not (NEW.into_topic_id is not null and NEW.into_tag_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'items-disagree' and not (NEW.into_tag_id is null and NEW.into_topic_id is null and NEW.from_item_id is not null and NEW.into_item_id is not null and NEW.from_digest is not null and NEW.into_digest is not null and NEW.from_item_id <> NEW.into_item_id)) BEGIN
	SELECT RAISE(ABORT, 'pins_subject: a Pin names the target of its kind');
END;