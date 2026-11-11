CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`from_tag_id` integer NOT NULL,
	`into_tag_id` integer NOT NULL,
	`reason` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`cursor` integer,
	`moved` integer,
	`unit_revision` integer,
	FOREIGN KEY (`from_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "proposals_distinct" CHECK("proposals"."from_tag_id" <> "proposals"."into_tag_id"),
	CONSTRAINT "proposals_open_reason" CHECK("proposals"."state" <> 'open' or length(coalesce("proposals"."reason", '')) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_pair` ON `proposals` (min(`from_tag_id`, `into_tag_id`), max(`from_tag_id`, `into_tag_id`));--> statement-breakpoint
CREATE INDEX `proposals_from` ON `proposals` (`from_tag_id`);--> statement-breakpoint
CREATE INDEX `proposals_into` ON `proposals` (`into_tag_id`);--> statement-breakpoint
CREATE INDEX `proposals_state` ON `proposals` (`state`,`id`);
--> statement-breakpoint
DROP TRIGGER `jobs_values_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_values_update`;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick', 'proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick', 'proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_insert` BEFORE INSERT ON `proposals` WHEN NEW.kind not in ('tag-merge') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_values_update` BEFORE UPDATE OF `kind`, `state` ON `proposals` WHEN NEW.kind not in ('tag-merge') or NEW.state not in ('open', 'accepting', 'rejected', 'declined') BEGIN
	SELECT RAISE(ABORT, 'proposals_values: a proposal has a known kind and state');
END;
