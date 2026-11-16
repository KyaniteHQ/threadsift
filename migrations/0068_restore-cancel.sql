DROP TRIGGER `restores_values_insert`;
--> statement-breakpoint
DROP TRIGGER `restores_values_update`;
--> statement-breakpoint
CREATE TRIGGER `restores_values_insert` BEFORE INSERT ON `restores` WHEN NEW.state not in ('uploading', 'running', 'done', 'failed', 'cancelled') BEGIN
	SELECT RAISE(ABORT, 'restores_values: a restore has a known state');
END;
--> statement-breakpoint
CREATE TRIGGER `restores_values_update` BEFORE UPDATE OF `state` ON `restores` WHEN NEW.state not in ('uploading', 'running', 'done', 'failed', 'cancelled') BEGIN
	SELECT RAISE(ABORT, 'restores_values: a restore has a known state');
END;
--> statement-breakpoint
DROP TRIGGER `items_restoring`;
--> statement-breakpoint
CREATE TRIGGER `items_restoring` BEFORE INSERT ON `items` WHEN EXISTS (SELECT 1 FROM `restores` WHERE (`state` = 'running' OR (`state` = 'failed' AND `failure` = 'gave-up')) AND `writing` = 0 AND `id` = (SELECT max(`id`) FROM `restores`)) BEGIN
	SELECT RAISE(ABORT, 'items_restoring: a restore holds the library, so only the restore adds Items');
END;
