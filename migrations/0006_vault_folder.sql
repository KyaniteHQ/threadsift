CREATE TABLE vault_folder_log_sequence AS
SELECT seq FROM sqlite_sequence WHERE name = 'log_entries';
--> statement-breakpoint
CREATE TABLE `__new_log_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`title` text,
	`path` text,
	`topic` text,
	`tags` text,
	`added` integer,
	`removed` integer,
	`picks` integer,
	`merged_from` text,
	`merged_into` text,
	`moved` integer,
	`item_id` integer,
	`topic_id` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "log_entries_action_check" CHECK("__new_log_entries"."action" in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge', 'merge-topic', 'vault-file-skipped', 'vault-file-conflict')),
	CONSTRAINT "log_entries_vault_path" CHECK(("__new_log_entries"."path" is not null) = ("__new_log_entries"."action" in ('vault-file-skipped', 'vault-file-conflict')))
);
--> statement-breakpoint
INSERT INTO `__new_log_entries`("id", "at", "action", "title", "path", "topic", "tags", "added", "removed", "picks", "merged_from", "merged_into", "moved", "item_id", "topic_id") SELECT "id", "at", "action", "title", "path", "topic", "tags", "added", "removed", "picks", "merged_from", "merged_into", "moved", "item_id", "topic_id" FROM `log_entries`;--> statement-breakpoint
DROP TABLE `log_entries`;--> statement-breakpoint
ALTER TABLE `__new_log_entries` RENAME TO `log_entries`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq)
SELECT 'log_entries', seq FROM vault_folder_log_sequence
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'log_entries');
--> statement-breakpoint
UPDATE sqlite_sequence
SET seq = max(seq, (SELECT seq FROM vault_folder_log_sequence))
WHERE name = 'log_entries' AND EXISTS (SELECT 1 FROM vault_folder_log_sequence);
--> statement-breakpoint
DROP TABLE vault_folder_log_sequence;
--> statement-breakpoint
CREATE INDEX `log_entries_at` ON `log_entries` (`at`);--> statement-breakpoint
CREATE INDEX `log_entries_item` ON `log_entries` (`item_id`);--> statement-breakpoint
CREATE INDEX `log_entries_topic` ON `log_entries` (`topic_id`);--> statement-breakpoint
CREATE TABLE `__new_vault_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'github' NOT NULL,
	`folder` text,
	`repository` text,
	`branch` text,
	`sealed_token` text,
	`generation` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`rate_failures` integer DEFAULT 0 NOT NULL,
	`scan_pending` integer DEFAULT true NOT NULL,
	`wiki_pending` integer DEFAULT true NOT NULL,
	CONSTRAINT "vault_settings_one_row" CHECK("__new_vault_settings"."id" = 1),
	CONSTRAINT "vault_settings_target" CHECK(("__new_vault_settings"."mode" = 'github' and "__new_vault_settings"."repository" is not null and "__new_vault_settings"."branch" is not null and "__new_vault_settings"."sealed_token" is not null and "__new_vault_settings"."folder" is null)
        or ("__new_vault_settings"."mode" = 'folder' and "__new_vault_settings"."folder" is not null and substr("__new_vault_settings"."folder", 1, 1) = '/' and "__new_vault_settings"."repository" is null and "__new_vault_settings"."branch" is null and "__new_vault_settings"."sealed_token" is null))
);
--> statement-breakpoint
INSERT INTO `__new_vault_settings`("id", "mode", "folder", "repository", "branch", "sealed_token", "generation", "lease_until", "next_attempt_at", "rate_failures", "scan_pending", "wiki_pending") SELECT "id", 'github', NULL, "repository", "branch", "sealed_token", "generation", "lease_until", "next_attempt_at", "rate_failures", "scan_pending", "wiki_pending" FROM `vault_settings`;--> statement-breakpoint
DROP TABLE `vault_settings`;--> statement-breakpoint
ALTER TABLE `__new_vault_settings` RENAME TO `vault_settings`;--> statement-breakpoint
ALTER TABLE `mirror_notes` ADD `conflict_path` text;
