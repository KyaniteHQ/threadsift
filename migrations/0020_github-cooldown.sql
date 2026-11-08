CREATE TABLE `github_cooldown` (
	`id` integer PRIMARY KEY NOT NULL,
	`until` integer NOT NULL,
	CONSTRAINT "github_cooldown_is_one_row" CHECK("github_cooldown"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `wait_reason` text;