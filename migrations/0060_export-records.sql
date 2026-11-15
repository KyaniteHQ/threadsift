CREATE TABLE `exports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`stream` integer DEFAULT 0 NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`entries` integer DEFAULT 0 NOT NULL,
	`data_bytes` integer DEFAULT 0 NOT NULL,
	`dir_bytes` integer DEFAULT 0 NOT NULL,
	`tail_bytes` integer DEFAULT 0 NOT NULL,
	`parts` integer DEFAULT 0 NOT NULL,
	`tally` text DEFAULT '{}' NOT NULL,
	`failure` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exports_one_live` ON `exports` ((1)) WHERE "exports"."state" in ('running', 'ready');--> statement-breakpoint
CREATE TRIGGER `exports_values_insert` BEFORE INSERT ON `exports` WHEN NEW.state not in ('running', 'ready', 'failed', 'expired') BEGIN
	SELECT RAISE(ABORT, 'exports_values: an export has a known state');
END;
--> statement-breakpoint
CREATE TRIGGER `exports_values_update` BEFORE UPDATE OF `state` ON `exports` WHEN NEW.state not in ('running', 'ready', 'failed', 'expired') BEGIN
	SELECT RAISE(ABORT, 'exports_values: an export has a known state');
END;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer,
	`address` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`stale_requeues` integer DEFAULT 0 NOT NULL,
	`attempt_generation` integer,
	`next_attempt_at` integer NOT NULL,
	`claim_expires` integer,
	`wait_reason` text,
	`page` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "kind", "item_id", "address", "state", "attempts", "stale_requeues", "attempt_generation", "next_attempt_at", "claim_expires", "wait_reason", "page") SELECT "id", "kind", "item_id", "address", "state", "attempts", "stale_requeues", "attempt_generation", "next_attempt_at", "claim_expires", "wait_reason", "page" FROM `jobs`;--> statement-breakpoint
INSERT INTO `__new_jobs`(`id`, `kind`, `address`, `state`, `next_attempt_at`) SELECT `seq`, 'fetch', '', 'done', 0 FROM `sqlite_sequence` WHERE `name` = 'jobs' AND `seq` > (SELECT coalesce(max(`id`), 0) FROM `__new_jobs`);--> statement-breakpoint
DELETE FROM `__new_jobs` WHERE `item_id` IS NULL;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_open_per_item_kind` ON `jobs` (`item_id`,`kind`) WHERE "jobs"."state" <> 'done';--> statement-breakpoint
CREATE INDEX `jobs_state_next_attempt` ON `jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals', 'export') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals', 'export') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_owner_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind <> 'export' and NEW.item_id is null BEGIN
	SELECT RAISE(ABORT, 'jobs_owner: only an export job has no Item');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_owner_update` BEFORE UPDATE OF `kind`, `item_id` ON `jobs` WHEN NEW.kind <> 'export' and NEW.item_id is null BEGIN
	SELECT RAISE(ABORT, 'jobs_owner: only an export job has no Item');
END;
