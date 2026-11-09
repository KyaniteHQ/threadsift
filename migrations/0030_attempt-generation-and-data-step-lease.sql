CREATE TABLE `data_step_lease` (
	`id` integer PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "data_step_lease_is_one_row" CHECK("data_step_lease"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `attempt_generation` integer;