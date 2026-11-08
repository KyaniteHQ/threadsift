CREATE TABLE `data_step_renames` (
	`step` text NOT NULL,
	`subject` integer NOT NULL,
	`old_key` text NOT NULL,
	`new_key` text NOT NULL,
	PRIMARY KEY(`step`, `subject`)
);
--> statement-breakpoint
CREATE INDEX `data_step_renames_new_key` ON `data_step_renames` (`step`,`new_key`);--> statement-breakpoint
CREATE TABLE `data_steps` (
	`name` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`cursor` text
);
