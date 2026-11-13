PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`from_tag_id` integer,
	`into_tag_id` integer,
	`from_topic_id` integer,
	`into_topic_id` integer,
	`reason` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`cursor` integer,
	`moved` integer,
	`unit_revision` integer,
	FOREIGN KEY (`from_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "proposals_distinct" CHECK("__new_proposals"."from_tag_id" <> "__new_proposals"."into_tag_id"),
	CONSTRAINT "proposals_topic_distinct" CHECK("__new_proposals"."from_topic_id" <> "__new_proposals"."into_topic_id"),
	CONSTRAINT "proposals_open_reason" CHECK("__new_proposals"."state" <> 'open' or length(coalesce("__new_proposals"."reason", '')) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_proposals`("id", "kind", "from_tag_id", "into_tag_id", "reason", "state", "created_at", "cursor", "moved", "unit_revision") SELECT "id", "kind", "from_tag_id", "into_tag_id", "reason", "state", "created_at", "cursor", "moved", "unit_revision" FROM `proposals`;--> statement-breakpoint
INSERT INTO `__new_proposals`(`id`, `kind`, `state`, `created_at`) SELECT `seq`, 'tag-merge', 'rejected', 0 FROM `sqlite_sequence` WHERE `name` = 'proposals' AND `seq` > (SELECT coalesce(max(`id`), 0) FROM `__new_proposals`);--> statement-breakpoint
DELETE FROM `__new_proposals` WHERE `from_tag_id` IS NULL;--> statement-breakpoint
DROP TABLE `proposals`;--> statement-breakpoint
ALTER TABLE `__new_proposals` RENAME TO `proposals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_pair` ON `proposals` (min(`from_tag_id`, `into_tag_id`), max(`from_tag_id`, `into_tag_id`));--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_topic_pair` ON `proposals` (min(`from_topic_id`, `into_topic_id`), max(`from_topic_id`, `into_topic_id`));--> statement-breakpoint
CREATE INDEX `proposals_from` ON `proposals` (`from_tag_id`);--> statement-breakpoint
CREATE INDEX `proposals_into` ON `proposals` (`into_tag_id`);--> statement-breakpoint
CREATE INDEX `proposals_from_topic` ON `proposals` (`from_topic_id`);--> statement-breakpoint
CREATE INDEX `proposals_into_topic` ON `proposals` (`into_topic_id`);--> statement-breakpoint
CREATE INDEX `proposals_state` ON `proposals` (`state`,`id`);--> statement-breakpoint
DROP TRIGGER `jobs_values_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_values_update`;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_insert` BEFORE INSERT ON `proposals` WHEN NEW.kind not in ('tag-merge', 'topic-merge') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_update` BEFORE UPDATE OF `kind`, `state` ON `proposals` WHEN NEW.kind not in ('tag-merge', 'topic-merge') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_subject_insert` BEFORE INSERT ON `proposals` WHEN (NEW.kind = 'tag-merge' and not (NEW.from_tag_id is not null and NEW.into_tag_id is not null and NEW.from_topic_id is null and NEW.into_topic_id is null)) or (NEW.kind = 'topic-merge' and not (NEW.from_topic_id is not null and NEW.into_topic_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null)) BEGIN
	SELECT RAISE(ABORT, 'proposals_subject: a proposal names the subjects of its kind');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_subject_update` BEFORE UPDATE OF `kind`, `from_tag_id`, `into_tag_id`, `from_topic_id`, `into_topic_id` ON `proposals` WHEN (NEW.kind = 'tag-merge' and not (NEW.from_tag_id is not null and NEW.into_tag_id is not null and NEW.from_topic_id is null and NEW.into_topic_id is null)) or (NEW.kind = 'topic-merge' and not (NEW.from_topic_id is not null and NEW.into_topic_id is not null and NEW.from_tag_id is null and NEW.into_tag_id is null)) BEGIN
	SELECT RAISE(ABORT, 'proposals_subject: a proposal names the subjects of its kind');
END;
