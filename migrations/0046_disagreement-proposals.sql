CREATE TABLE `topic_checks` (
	`topic_id` integer PRIMARY KEY NOT NULL,
	`members` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `from_item_id` integer REFERENCES items(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `proposals` ADD `into_item_id` integer REFERENCES items(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `proposals` ADD `from_digest` integer;
--> statement-breakpoint
ALTER TABLE `proposals` ADD `into_digest` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_item_pair` ON `proposals` (min(`from_item_id`, `into_item_id`), max(`from_item_id`, `into_item_id`));
--> statement-breakpoint
CREATE INDEX `proposals_from_item` ON `proposals` (`from_item_id`);
--> statement-breakpoint
CREATE INDEX `proposals_into_item` ON `proposals` (`into_item_id`);
--> statement-breakpoint
DROP TRIGGER `jobs_values_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_values_update`;
--> statement-breakpoint
DROP TRIGGER `proposals_values_insert`;
--> statement-breakpoint
DROP TRIGGER `proposals_values_update`;
--> statement-breakpoint
DROP TRIGGER `proposals_subject_insert`;
--> statement-breakpoint
DROP TRIGGER `proposals_subject_update`;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_insert` BEFORE INSERT ON `proposals` WHEN NEW.kind not in ('tag-merge', 'topic-merge', 'highlight-lost', 'overview-gap', 'items-disagree') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_update` BEFORE UPDATE OF `kind`, `state` ON `proposals` WHEN NEW.kind not in ('tag-merge', 'topic-merge', 'highlight-lost', 'overview-gap', 'items-disagree') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_subject_insert` BEFORE INSERT ON `proposals` WHEN (NEW.kind = 'tag-merge' and not (NEW.from_tag_id is not null and NEW.into_tag_id is not null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'topic-merge' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is not null and NEW.into_topic_id is not null and NEW.highlight_id is null and NEW.topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'highlight-lost' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is not null and NEW.topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'overview-gap' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is not null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'items-disagree' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is null and NEW.from_item_id is not null and NEW.into_item_id is not null and NEW.from_digest is not null and NEW.into_digest is not null and NEW.from_item_id <> NEW.into_item_id)) BEGIN
	SELECT RAISE(ABORT, 'proposals_subject: a proposal names the subjects of its kind');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_subject_update` BEFORE UPDATE OF `kind`, `from_tag_id`, `into_tag_id`, `from_topic_id`, `into_topic_id`, `highlight_id`, `topic_id`, `from_item_id`, `into_item_id`, `from_digest`, `into_digest` ON `proposals` WHEN (NEW.kind = 'tag-merge' and not (NEW.from_tag_id is not null and NEW.into_tag_id is not null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'topic-merge' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is not null and NEW.into_topic_id is not null and NEW.highlight_id is null and NEW.topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'highlight-lost' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is not null and NEW.topic_id is null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'overview-gap' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is not null and NEW.from_item_id is null and NEW.into_item_id is null and NEW.from_digest is null and NEW.into_digest is null)) or (NEW.kind = 'items-disagree' and not (NEW.from_tag_id is null and NEW.into_tag_id is null and NEW.from_topic_id is null and NEW.into_topic_id is null and NEW.highlight_id is null and NEW.topic_id is null and NEW.from_item_id is not null and NEW.into_item_id is not null and NEW.from_digest is not null and NEW.into_digest is not null and NEW.from_item_id <> NEW.into_item_id)) BEGIN
	SELECT RAISE(ABORT, 'proposals_subject: a proposal names the subjects of its kind');
END;