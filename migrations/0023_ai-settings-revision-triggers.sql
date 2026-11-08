INSERT INTO `ai_settings_revision` (`id`, `revision`) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER `settings_revision_insert` AFTER INSERT ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_update` AFTER UPDATE ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_delete` AFTER DELETE ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
