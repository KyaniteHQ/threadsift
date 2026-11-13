DROP TRIGGER `log_entries_action_insert`;
--> statement-breakpoint
DROP TRIGGER `log_entries_action_update`;
--> statement-breakpoint
CREATE TRIGGER `log_entries_action_insert` BEFORE INSERT ON `log_entries` WHEN NEW.action not in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge', 'merge-topic') BEGIN
	SELECT RAISE(ABORT, 'log_entries_action: a Log entry has a known action');
END;
--> statement-breakpoint
CREATE TRIGGER `log_entries_action_update` BEFORE UPDATE OF `action` ON `log_entries` WHEN NEW.action not in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge', 'merge-topic') BEGIN
	SELECT RAISE(ABORT, 'log_entries_action: a Log entry has a known action');
END;
