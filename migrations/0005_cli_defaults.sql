CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`base_url` text,
	`model` text NOT NULL,
	`sealed_key` text,
	`effort` text,
	`cli_choice` text DEFAULT 'custom' NOT NULL,
	CONSTRAINT "settings_cli_choice" CHECK("__new_settings"."cli_choice" = 'custom' or ("__new_settings"."cli_choice" in ('recommended', 'cli-defaults') and "__new_settings"."provider" in ('claude-code', 'codex') and "__new_settings"."model" = '' and "__new_settings"."effort" is null)),
	CONSTRAINT "settings_custom_cli_overrides" CHECK("__new_settings"."cli_choice" <> 'custom' or "__new_settings"."provider" not in ('claude-code', 'codex') or trim("__new_settings"."model") <> '' or nullif(trim("__new_settings"."effort"), '') is not null),
	CONSTRAINT "settings_effort_provider" CHECK("__new_settings"."effort" is null or "__new_settings"."provider" in ('claude-code', 'codex')),
	CONSTRAINT "settings_is_one_row" CHECK("__new_settings"."id" = 1),
	CONSTRAINT "settings_connection_columns" CHECK(("__new_settings"."provider" in ('workers-ai', 'claude-code', 'codex') and "__new_settings"."base_url" is null and "__new_settings"."sealed_key" is null) or ("__new_settings"."provider" not in ('workers-ai', 'claude-code', 'codex') and "__new_settings"."base_url" is not null and "__new_settings"."sealed_key" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "provider", "base_url", "model", "sealed_key", "effort", "cli_choice") SELECT "id", "provider", "base_url", "model", "sealed_key", "effort",
  CASE WHEN "provider" IN ('claude-code', 'codex') AND "model" = '' AND "effort" IS NULL
    THEN 'recommended' ELSE 'custom' END
FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_delete` AFTER DELETE ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_insert` AFTER INSERT ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_update` AFTER UPDATE ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
