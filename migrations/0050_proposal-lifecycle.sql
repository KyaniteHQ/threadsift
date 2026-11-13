CREATE TRIGGER `proposals_state_insert` BEFORE INSERT ON `proposals` WHEN NEW.state in ('accepting', 'declined') and NEW.kind not in ('tag-merge', 'topic-merge') BEGIN
	SELECT RAISE(ABORT, 'proposals_state: only a merge proposal is accepting or declined');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_state_update` BEFORE UPDATE OF `kind`, `state` ON `proposals` WHEN NEW.state in ('accepting', 'declined') and NEW.kind not in ('tag-merge', 'topic-merge') BEGIN
	SELECT RAISE(ABORT, 'proposals_state: only a merge proposal is accepting or declined');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_accepting_insert` BEFORE INSERT ON `proposals` WHEN NEW.state <> 'accepting' and (NEW.cursor is not null or NEW.moved is not null or NEW.unit_revision is not null) BEGIN
	SELECT RAISE(ABORT, 'proposals_accepting: a proposal holds a cursor, a moved count and a unit revision only while accepting');
END;
--> statement-breakpoint
CREATE TRIGGER `proposals_accepting_update` BEFORE UPDATE OF `state`, `cursor`, `moved`, `unit_revision` ON `proposals` WHEN NEW.state <> 'accepting' and (NEW.cursor is not null or NEW.moved is not null or NEW.unit_revision is not null) BEGIN
	SELECT RAISE(ABORT, 'proposals_accepting: a proposal holds a cursor, a moved count and a unit revision only while accepting');
END;