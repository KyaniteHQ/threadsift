ALTER TABLE `proposals` ADD `failed_runs` integer;
--> statement-breakpoint
DROP TRIGGER `proposals_accepting_insert`;
--> statement-breakpoint
DROP TRIGGER `proposals_accepting_update`;
--> statement-breakpoint
CREATE TRIGGER `proposals_accepting_insert` BEFORE INSERT ON `proposals` WHEN NEW.state <> 'accepting' and (NEW.cursor is not null or NEW.moved is not null or NEW.unit_revision is not null or NEW.failed_runs is not null) BEGIN
	SELECT RAISE(ABORT, 'proposals_accepting: a proposal holds a cursor, a moved count, a unit revision and a failed-run count only while accepting');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_accepting_update` BEFORE UPDATE OF `state`, `cursor`, `moved`, `unit_revision`, `failed_runs` ON `proposals` WHEN NEW.state <> 'accepting' and (NEW.cursor is not null or NEW.moved is not null or NEW.unit_revision is not null or NEW.failed_runs is not null) BEGIN
	SELECT RAISE(ABORT, 'proposals_accepting: a proposal holds a cursor, a moved count, a unit revision and a failed-run count only while accepting');
END;
