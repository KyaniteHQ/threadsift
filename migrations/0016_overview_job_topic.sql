DROP INDEX `jobs_one_open_per_item_kind`;--> statement-breakpoint
ALTER TABLE `jobs` ADD `topic_id` integer REFERENCES topics(id) ON DELETE set null;--> statement-breakpoint
UPDATE `jobs` SET `topic_id` = (SELECT `items`.`topic_id` FROM `items` WHERE `items`.`id` = `jobs`.`item_id`) WHERE `jobs`.`kind` = 'topic_overview' AND `jobs`.`state` <> 'done';--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_open_overview_per_topic_item` ON `jobs` (`topic_id`,`item_id`) WHERE "jobs"."state" <> 'done' and "jobs"."kind" = 'topic_overview';--> statement-breakpoint
CREATE INDEX `jobs_by_item` ON `jobs` (`item_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_open_per_item_kind` ON `jobs` (`item_id`,`kind`) WHERE "jobs"."state" <> 'done' and "jobs"."kind" <> 'topic_overview';