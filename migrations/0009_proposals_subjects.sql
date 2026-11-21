CREATE TABLE `proposals_before` AS SELECT * FROM `proposals`;
--> statement-breakpoint
CREATE TABLE `proposals_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'proposals';
--> statement-breakpoint
DROP TABLE `proposals`;
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`reason` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`cursor` integer,
	`moved` integer,
	`unit_revision` integer,
	`failed_runs` integer,
	CONSTRAINT "proposals_accepting_check" CHECK("proposals"."state" = 'accepting' or ("proposals"."cursor" is null and "proposals"."moved" is null and "proposals"."unit_revision" is null and "proposals"."failed_runs" is null)),
	CONSTRAINT "proposals_state_check" CHECK("proposals"."state" not in ('accepting', 'declined') or "proposals"."kind" in ('tag-merge', 'topic-merge')),
	CONSTRAINT "proposals_values_check" CHECK("proposals"."kind" in ('tag-merge', 'topic-merge', 'highlight-lost', 'overview-gap', 'items-disagree') and "proposals"."state" in ('open', 'accepting', 'rejected', 'declined')),
	CONSTRAINT "proposals_open_reason" CHECK("proposals"."state" <> 'open' or length(coalesce("proposals"."reason", '')) > 0)
);
--> statement-breakpoint
CREATE INDEX `proposals_state` ON `proposals` (`state`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_id_kind` ON `proposals` (`id`,`kind`);
--> statement-breakpoint
INSERT INTO `proposals` (`id`, `kind`, `reason`, `state`, `created_at`, `cursor`, `moved`, `unit_revision`, `failed_runs`)
SELECT `id`, `kind`, `reason`, `state`, `created_at`, `cursor`, `moved`, `unit_revision`, `failed_runs` FROM `proposals_before` ORDER BY `id`;
--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq)
SELECT 'proposals', seq FROM proposals_sequence
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'proposals');
--> statement-breakpoint
UPDATE sqlite_sequence
SET seq = max(seq, (SELECT seq FROM proposals_sequence))
WHERE name = 'proposals' AND EXISTS (SELECT 1 FROM proposals_sequence);
--> statement-breakpoint
DELETE FROM sqlite_sequence
WHERE name = 'proposals' AND NOT EXISTS (SELECT 1 FROM proposals_sequence);
--> statement-breakpoint
CREATE TABLE `highlight_lost_proposals` (
	`proposal_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`highlight_id` integer NOT NULL,
	FOREIGN KEY (`proposal_id`,`kind`) REFERENCES `proposals`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`highlight_id`) REFERENCES `highlights`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "highlight_lost_proposals_kind" CHECK("highlight_lost_proposals"."kind" = 'highlight-lost')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `highlight_lost_proposals_highlight` ON `highlight_lost_proposals` (`highlight_id`);--> statement-breakpoint
CREATE TABLE `items_disagree_proposals` (
	`proposal_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`from_item_id` integer NOT NULL,
	`into_item_id` integer NOT NULL,
	`from_digest` integer NOT NULL,
	`into_digest` integer NOT NULL,
	FOREIGN KEY (`proposal_id`,`kind`) REFERENCES `proposals`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "items_disagree_proposals_distinct" CHECK("items_disagree_proposals"."from_item_id" <> "items_disagree_proposals"."into_item_id"),
	CONSTRAINT "items_disagree_proposals_kind" CHECK("items_disagree_proposals"."kind" = 'items-disagree')
);
--> statement-breakpoint
CREATE INDEX `items_disagree_proposals_from` ON `items_disagree_proposals` (`from_item_id`);--> statement-breakpoint
CREATE INDEX `items_disagree_proposals_into` ON `items_disagree_proposals` (`into_item_id`);--> statement-breakpoint
CREATE TABLE `overview_gap_proposals` (
	`proposal_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`topic_id` integer NOT NULL,
	FOREIGN KEY (`proposal_id`,`kind`) REFERENCES `proposals`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "overview_gap_proposals_kind" CHECK("overview_gap_proposals"."kind" = 'overview-gap')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `overview_gap_proposals_topic` ON `overview_gap_proposals` (`topic_id`);--> statement-breakpoint
CREATE TABLE `tag_merge_proposals` (
	`proposal_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`from_tag_id` integer NOT NULL,
	`into_tag_id` integer NOT NULL,
	FOREIGN KEY (`proposal_id`,`kind`) REFERENCES `proposals`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tag_merge_proposals_distinct" CHECK("tag_merge_proposals"."from_tag_id" <> "tag_merge_proposals"."into_tag_id"),
	CONSTRAINT "tag_merge_proposals_kind" CHECK("tag_merge_proposals"."kind" = 'tag-merge')
);
--> statement-breakpoint
CREATE INDEX `tag_merge_proposals_from` ON `tag_merge_proposals` (`from_tag_id`);--> statement-breakpoint
CREATE INDEX `tag_merge_proposals_into` ON `tag_merge_proposals` (`into_tag_id`);--> statement-breakpoint
CREATE TABLE `topic_merge_proposals` (
	`proposal_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`from_topic_id` integer NOT NULL,
	`into_topic_id` integer NOT NULL,
	FOREIGN KEY (`proposal_id`,`kind`) REFERENCES `proposals`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "topic_merge_proposals_distinct" CHECK("topic_merge_proposals"."from_topic_id" <> "topic_merge_proposals"."into_topic_id"),
	CONSTRAINT "topic_merge_proposals_kind" CHECK("topic_merge_proposals"."kind" = 'topic-merge')
);
--> statement-breakpoint
CREATE INDEX `topic_merge_proposals_from` ON `topic_merge_proposals` (`from_topic_id`);--> statement-breakpoint
CREATE INDEX `topic_merge_proposals_into` ON `topic_merge_proposals` (`into_topic_id`);--> statement-breakpoint
INSERT INTO `tag_merge_proposals` (`proposal_id`, `kind`, `from_tag_id`, `into_tag_id`)
SELECT `id`, 'tag-merge', `from_tag_id`, `into_tag_id` FROM `proposals_before` WHERE `kind` = 'tag-merge';
--> statement-breakpoint
INSERT INTO `topic_merge_proposals` (`proposal_id`, `kind`, `from_topic_id`, `into_topic_id`)
SELECT `id`, 'topic-merge', `from_topic_id`, `into_topic_id` FROM `proposals_before` WHERE `kind` = 'topic-merge';
--> statement-breakpoint
INSERT INTO `highlight_lost_proposals` (`proposal_id`, `kind`, `highlight_id`)
SELECT `id`, 'highlight-lost', `highlight_id` FROM `proposals_before` WHERE `kind` = 'highlight-lost';
--> statement-breakpoint
INSERT INTO `overview_gap_proposals` (`proposal_id`, `kind`, `topic_id`)
SELECT `id`, 'overview-gap', `topic_id` FROM `proposals_before` WHERE `kind` = 'overview-gap';
--> statement-breakpoint
INSERT INTO `items_disagree_proposals` (`proposal_id`, `kind`, `from_item_id`, `into_item_id`, `from_digest`, `into_digest`)
SELECT `id`, 'items-disagree', `from_item_id`, `into_item_id`, `from_digest`, `into_digest` FROM `proposals_before` WHERE `kind` = 'items-disagree';
--> statement-breakpoint
DROP TABLE `proposals_before`;
--> statement-breakpoint
DROP TABLE `proposals_sequence`;
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_merge_proposals_pair` ON `tag_merge_proposals` (min(`from_tag_id`, `into_tag_id`), max(`from_tag_id`, `into_tag_id`));
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_merge_proposals_pair` ON `topic_merge_proposals` (min(`from_topic_id`, `into_topic_id`), max(`from_topic_id`, `into_topic_id`));
--> statement-breakpoint
CREATE UNIQUE INDEX `items_disagree_proposals_pair` ON `items_disagree_proposals` (min(`from_item_id`, `into_item_id`), max(`from_item_id`, `into_item_id`));
--> statement-breakpoint
CREATE TRIGGER `tag_merge_proposals_gone` AFTER DELETE ON `tag_merge_proposals` BEGIN
	DELETE FROM `proposals` WHERE `id` = OLD.`proposal_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `topic_merge_proposals_gone` AFTER DELETE ON `topic_merge_proposals` BEGIN
	DELETE FROM `proposals` WHERE `id` = OLD.`proposal_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `highlight_lost_proposals_gone` AFTER DELETE ON `highlight_lost_proposals` BEGIN
	DELETE FROM `proposals` WHERE `id` = OLD.`proposal_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `overview_gap_proposals_gone` AFTER DELETE ON `overview_gap_proposals` BEGIN
	DELETE FROM `proposals` WHERE `id` = OLD.`proposal_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `items_disagree_proposals_gone` AFTER DELETE ON `items_disagree_proposals` BEGIN
	DELETE FROM `proposals` WHERE `id` = OLD.`proposal_id`;
END;
