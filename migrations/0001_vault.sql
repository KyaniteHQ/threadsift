CREATE TABLE `mirror_files` (
	`path` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`sha` text,
	CONSTRAINT "mirror_files_kind" CHECK("mirror_files"."kind" in ('item'))
);
--> statement-breakpoint
CREATE TABLE `mirror_notes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mirror_notes_kind" CHECK("mirror_notes"."kind" in ('item')),
	CONSTRAINT "mirror_notes_retry" CHECK("mirror_notes"."retry_at" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mirror_notes_subject` ON `mirror_notes` (`kind`,`subject_id`);--> statement-breakpoint
CREATE TABLE `vault_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`repository` text NOT NULL,
	`branch` text NOT NULL,
	`sealed_token` text NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`rate_failures` integer DEFAULT 0 NOT NULL,
	`scan_pending` integer DEFAULT true NOT NULL,
	CONSTRAINT "vault_settings_one_row" CHECK("vault_settings"."id" = 1)
);

--> statement-breakpoint
CREATE TRIGGER vault_settings_insert AFTER INSERT ON vault_settings BEGIN
  INSERT INTO mirror_notes(kind, subject_id) SELECT 'item', id FROM items WHERE true ON CONFLICT(kind, subject_id) DO UPDATE SET sequence = excluded.sequence, retry_at = 0;
END;
--> statement-breakpoint
CREATE TRIGGER vault_settings_update AFTER UPDATE OF sealed_token ON vault_settings BEGIN
  INSERT INTO mirror_notes(kind, subject_id) SELECT 'item', id FROM items WHERE true ON CONFLICT(kind, subject_id) DO UPDATE SET sequence = excluded.sequence, retry_at = 0;
END;
--> statement-breakpoint
CREATE TRIGGER vault_restore_start AFTER UPDATE OF state ON restores WHEN NEW.state = 'running' AND OLD.state = 'uploading' BEGIN
  UPDATE vault_settings SET generation = generation + 1, lease_until = 0;
END;
--> statement-breakpoint
CREATE TRIGGER vault_restore_finish AFTER UPDATE OF state ON restores WHEN NEW.state IN ('done', 'cancelled') AND OLD.state <> 'uploading' AND EXISTS (SELECT 1 FROM vault_settings) BEGIN
  UPDATE vault_settings SET scan_pending = 1;
  INSERT INTO mirror_notes(kind, subject_id) SELECT 'item', id FROM items WHERE true ON CONFLICT(kind, subject_id) DO UPDATE SET sequence = excluded.sequence, retry_at = 0;
  INSERT INTO mirror_notes(kind, subject_id) SELECT kind, subject_id FROM mirror_files WHERE true ON CONFLICT(kind, subject_id) DO UPDATE SET sequence = excluded.sequence, retry_at = 0;
END;
