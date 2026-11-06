CREATE TABLE `ai_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`inputs` text NOT NULL,
	`input_revision` integer NOT NULL,
	`executor` text NOT NULL,
	`attempts` integer NOT NULL,
	`deadline` integer NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`refusal` text,
	`status` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`sealed_key` text NOT NULL,
	CONSTRAINT "settings_is_one_row" CHECK("settings"."id" = 1)
);
