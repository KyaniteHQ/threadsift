DROP TRIGGER `items_status_reason_insert`;
--> statement-breakpoint
DROP TRIGGER `items_status_reason_update`;
--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `status`;
--> statement-breakpoint
CREATE TRIGGER `items_reason_insert` BEFORE INSERT ON `items` WHEN NEW.reason is not null and NEW.reason not in ('timeout','network','gave-up','rate-limited') BEGIN
	SELECT RAISE(ABORT, 'items_reason: an Item is failed with a known reason, or has none');
END;
--> statement-breakpoint
CREATE TRIGGER `items_reason_update` BEFORE UPDATE OF `reason` ON `items` WHEN NEW.reason is not null and NEW.reason not in ('timeout','network','gave-up','rate-limited') BEGIN
	SELECT RAISE(ABORT, 'items_reason: an Item is failed with a known reason, or has none');
END;
