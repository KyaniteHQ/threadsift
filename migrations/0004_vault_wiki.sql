DROP TRIGGER vault_settings_insert;
--> statement-breakpoint
DROP TRIGGER vault_settings_update;
--> statement-breakpoint
DROP TRIGGER vault_restore_start;
--> statement-breakpoint
DROP TRIGGER vault_restore_finish;
--> statement-breakpoint
CREATE TABLE vault_wiki_sequences AS
SELECT name, seq FROM sqlite_sequence WHERE name IN ('log_entries', 'mirror_notes');
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
	CONSTRAINT "log_entries_action_check" CHECK("__new_log_entries"."action" in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge', 'merge-topic', 'vault-file-skipped')),
	CONSTRAINT "log_entries_vault_path" CHECK(("__new_log_entries"."path" is not null) = ("__new_log_entries"."action" = 'vault-file-skipped'))
);
--> statement-breakpoint
INSERT INTO `__new_log_entries`("id", "at", "action", "title", "topic", "tags", "added", "removed", "picks", "merged_from", "merged_into", "moved", "item_id", "topic_id") SELECT "id", "at", "action", "title", "topic", "tags", "added", "removed", "picks", "merged_from", "merged_into", "moved", "item_id", "topic_id" FROM `log_entries`;--> statement-breakpoint
DROP TABLE `log_entries`;--> statement-breakpoint
ALTER TABLE `__new_log_entries` RENAME TO `log_entries`;--> statement-breakpoint
CREATE INDEX `log_entries_at` ON `log_entries` (`at`);--> statement-breakpoint
CREATE INDEX `log_entries_item` ON `log_entries` (`item_id`);--> statement-breakpoint
CREATE INDEX `log_entries_topic` ON `log_entries` (`topic_id`);--> statement-breakpoint
CREATE TABLE `__new_mirror_files` (
	`path` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`sha` text,
	CONSTRAINT "mirror_files_kind" CHECK("__new_mirror_files"."kind" in ('item', 'topic', 'index', 'log', 'log-month'))
);
--> statement-breakpoint
INSERT INTO `__new_mirror_files`("path", "kind", "subject_id", "sequence", "sha") SELECT "path", "kind", "subject_id", "sequence", "sha" FROM `mirror_files`;--> statement-breakpoint
DROP TABLE `mirror_files`;--> statement-breakpoint
ALTER TABLE `__new_mirror_files` RENAME TO `mirror_files`;--> statement-breakpoint
CREATE TABLE `__new_mirror_notes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mirror_notes_kind" CHECK("__new_mirror_notes"."kind" in ('item', 'topic', 'index', 'log', 'log-month')),
	CONSTRAINT "mirror_notes_retry" CHECK("__new_mirror_notes"."retry_at" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_mirror_notes`("sequence", "kind", "subject_id", "retry_at") SELECT "sequence", "kind", "subject_id", "retry_at" FROM `mirror_notes`;--> statement-breakpoint
DROP TABLE `mirror_notes`;--> statement-breakpoint
ALTER TABLE `__new_mirror_notes` RENAME TO `mirror_notes`;--> statement-breakpoint
CREATE UNIQUE INDEX `mirror_notes_subject` ON `mirror_notes` (`kind`,`subject_id`);--> statement-breakpoint
ALTER TABLE `vault_settings` ADD `wiki_pending` integer DEFAULT true NOT NULL;
--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq)
SELECT saved.name, saved.seq FROM vault_wiki_sequences AS saved
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = saved.name);
--> statement-breakpoint
UPDATE sqlite_sequence
SET seq = max(seq, (SELECT saved.seq FROM vault_wiki_sequences AS saved WHERE saved.name = sqlite_sequence.name))
WHERE name IN (SELECT name FROM vault_wiki_sequences);
--> statement-breakpoint
DROP TABLE vault_wiki_sequences;
