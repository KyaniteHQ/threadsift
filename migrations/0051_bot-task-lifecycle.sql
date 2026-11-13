ALTER TABLE `ai_tasks` ADD `callback_hash` text;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `job_id` integer;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `context` text;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `sent_at` integer;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `answered_at` integer;--> statement-breakpoint
CREATE INDEX `ai_tasks_job` ON `ai_tasks` (`job_id`);--> statement-breakpoint
CREATE INDEX `ai_tasks_executor_state` ON `ai_tasks` (`executor`,`state`);