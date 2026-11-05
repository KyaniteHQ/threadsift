CREATE TABLE `guards` (
	`ok` integer NOT NULL,
	CONSTRAINT "guards_hold" CHECK("guards"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`address` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`claim_expires` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_open_per_item_kind` ON `jobs` (`item_id`,`kind`) WHERE "jobs"."state" <> 'done';--> statement-breakpoint
CREATE INDEX `jobs_state_next_attempt` ON `jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `scheduled_runs` (
	`task` text PRIMARY KEY NOT NULL,
	`last_run_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `items` ADD `fetch_result` text;