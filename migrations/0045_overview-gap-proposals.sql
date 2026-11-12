ALTER TABLE `proposals` ADD `topic_id` integer REFERENCES topics(id) ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_overview_topic` ON `proposals` (`topic_id`);
--> statement-breakpoint
DROP TRIGGER `proposals_values_insert`;
--> statement-breakpoint
DROP TRIGGER `proposals_values_update`;
--> statement-breakpoint
DROP TRIGGER `proposals_subject_insert`;
--> statement-breakpoint
DROP TRIGGER `proposals_subject_update`;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_insert` BEFORE INSERT ON `proposals` WHEN NEW.kind not in ('tag-merge', 'topic-merge', 'highlight-lost', 'overview-gap') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_update` BEFORE UPDATE OF `kind`, `state` ON `proposals` WHEN NEW.kind not in ('tag-merge', 'topic-merge', 'highlight-lost', 'overview-gap') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_subject_insert` BEFORE INSERT ON `proposals` WHEN (NEW.kind = 'tag-merge' and not (NEW.from_tag_id is not null and NEW.into_tag_id is not null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is null)) or (NEW.kind = 'topic-merge' and not (NEW.from_topic_id is not null and NEW.into_topic_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.highlight_id is null and NEW.topic_id is null)) or (NEW.kind = 'highlight-lost' and not (NEW.highlight_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.topic_id is null)) or (NEW.kind = 'overview-gap' and not (NEW.topic_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null)) BEGIN
	SELECT RAISE(ABORT, 'proposals_subject: a proposal names the subjects of its kind');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_subject_update` BEFORE UPDATE OF `kind`, `from_tag_id`, `into_tag_id`, `from_topic_id`, `into_topic_id`, `highlight_id`, `topic_id` ON `proposals` WHEN (NEW.kind = 'tag-merge' and not (NEW.from_tag_id is not null and NEW.into_tag_id is not null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is null)) or (NEW.kind = 'topic-merge' and not (NEW.from_topic_id is not null and NEW.into_topic_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.highlight_id is null and NEW.topic_id is null)) or (NEW.kind = 'highlight-lost' and not (NEW.highlight_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.topic_id is null)) or (NEW.kind = 'overview-gap' and not (NEW.topic_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null)) BEGIN
	SELECT RAISE(ABORT, 'proposals_subject: a proposal names the subjects of its kind');
END;
