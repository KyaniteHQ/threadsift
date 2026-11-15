CREATE TABLE `restores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state` text NOT NULL,
	`phase` text DEFAULT 'upload' NOT NULL,
	`cursor` text DEFAULT '{}' NOT NULL,
	`restored` text DEFAULT '{}' NOT NULL,
	`dropped` text DEFAULT '{}' NOT NULL,
	`writing` integer DEFAULT 0 NOT NULL,
	`bytes` integer NOT NULL,
	`parts` integer NOT NULL,
	`part_bytes` integer NOT NULL,
	`failure` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restores_one_open` ON `restores` ((1)) WHERE "restores"."state" not in ('done', 'cancelled', 'failed');
--> statement-breakpoint
CREATE TRIGGER `restores_values_insert` BEFORE INSERT ON `restores` WHEN NEW.state not in ('uploading', 'running', 'done', 'failed') BEGIN
	SELECT RAISE(ABORT, 'restores_values: a restore has a known state');
END;
--> statement-breakpoint
CREATE TRIGGER `restores_values_update` BEFORE UPDATE OF `state` ON `restores` WHEN NEW.state not in ('uploading', 'running', 'done', 'failed') BEGIN
	SELECT RAISE(ABORT, 'restores_values: a restore has a known state');
END;
--> statement-breakpoint
DROP TRIGGER `jobs_values_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_values_update`;
--> statement-breakpoint
DROP TRIGGER `jobs_owner_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_owner_update`;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals', 'export', 'restore') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals', 'export', 'restore') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_owner_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('export', 'restore') and NEW.item_id is null BEGIN
	SELECT RAISE(ABORT, 'jobs_owner: only an export or restore job has no Item');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_owner_update` BEFORE UPDATE OF `kind`, `item_id` ON `jobs` WHEN NEW.kind not in ('export', 'restore') and NEW.item_id is null BEGIN
	SELECT RAISE(ABORT, 'jobs_owner: only an export or restore job has no Item');
END;
--> statement-breakpoint
CREATE TRIGGER `items_restoring` BEFORE INSERT ON `items` WHEN EXISTS (SELECT 1 FROM `restores` WHERE `state` = 'running' AND `writing` = 0) BEGIN
	SELECT RAISE(ABORT, 'items_restoring: a restore is running, so only the restore adds Items');
END;
