UPDATE `ai_tasks` SET `state` = 'failed', `result` = null, `refusal` = 'stale', `status` = null WHERE `state` = 'running' AND `job_id` IN (SELECT `id` FROM `jobs` WHERE `kind` = 'topic_overview' AND `state` <> 'done' AND `id` NOT IN (SELECT min(`id`) FROM `jobs` WHERE `kind` = 'topic_overview' AND `state` <> 'done' GROUP BY `item_id`));
UPDATE `jobs` SET `state` = 'done', `claim_expires` = null, `wait_reason` = null, `attempt_generation` = null, `attempt_pending` = null, `stale_requeues` = 0, `page` = null WHERE `id` IN (SELECT `id` FROM `jobs` WHERE `kind` = 'topic_overview' AND `state` <> 'done' AND `id` NOT IN (SELECT min(`id`) FROM `jobs` WHERE `kind` = 'topic_overview' AND `state` <> 'done' GROUP BY `item_id`));
DROP INDEX `jobs_one_open_per_item_kind`;
DROP INDEX `jobs_by_item`;
DROP INDEX `jobs_one_open_overview_per_topic_item`;
DROP INDEX `jobs_state_next_attempt`;
ALTER TABLE `jobs` RENAME TO `__migrated_jobs`;
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer,
	`address` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`stale_requeues` integer DEFAULT 0 NOT NULL,
	`attempt_generation` integer,
	`attempt_pending` text,
	`next_attempt_at` integer NOT NULL,
	`claim_expires` integer,
	`wait_reason` text,
	`page` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "jobs_owner_check" CHECK("jobs"."kind" in ('export', 'restore') or "jobs"."item_id" is not null),
	CONSTRAINT "jobs_values_check" CHECK("jobs"."kind" in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals', 'export', 'restore') and "jobs"."state" in ('queued', 'running', 'done'))
);
INSERT INTO `jobs` (`id`, `kind`, `item_id`, `address`, `state`, `attempts`, `stale_requeues`, `attempt_generation`, `attempt_pending`, `next_attempt_at`, `claim_expires`, `wait_reason`, `page`) SELECT `id`, `kind`, `item_id`, `address`, `state`, `attempts`, `stale_requeues`, `attempt_generation`, `attempt_pending`, `next_attempt_at`, `claim_expires`, `wait_reason`, `page` FROM `__migrated_jobs`;
UPDATE `sqlite_sequence` SET `seq` = max(`seq`, (SELECT `seq` FROM `sqlite_sequence` WHERE `name` = '__migrated_jobs')) WHERE `name` = 'jobs';
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT 'jobs', `seq` FROM `sqlite_sequence` WHERE `name` = '__migrated_jobs' AND NOT EXISTS (SELECT 1 FROM `sqlite_sequence` WHERE `name` = 'jobs');
DROP TABLE `__migrated_jobs`;
CREATE UNIQUE INDEX `jobs_one_open_per_item_kind` ON `jobs` (`item_id`,`kind`) WHERE "jobs"."state" <> 'done';
CREATE INDEX `jobs_state_next_attempt` ON `jobs` (`state`,`next_attempt_at`);
DELETE FROM `d1_migrations` WHERE `name` = '0014_overview_job_topic.sql';
