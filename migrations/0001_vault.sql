CREATE TABLE `mirror_files` (
	`path` text PRIMARY KEY NOT NULL,
	`item_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mirror_paths` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mirror_paths_item_id_unique` ON `mirror_paths` (`item_id`);--> statement-breakpoint
CREATE TABLE `vault_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`repository` text NOT NULL,
	`branch` text NOT NULL,
	`sealed_token` text NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vault_settings_one_row" CHECK("vault_settings"."id" = 1)
);
