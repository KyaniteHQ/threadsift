PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`base_url` text,
	`model` text NOT NULL,
	`sealed_key` text,
	CONSTRAINT "settings_is_one_row" CHECK("__new_settings"."id" = 1),
	CONSTRAINT "settings_connection_columns" CHECK(("__new_settings"."provider" in ('workers-ai', 'claude-code') and "__new_settings"."base_url" is null and "__new_settings"."sealed_key" is null) or ("__new_settings"."provider" not in ('workers-ai', 'claude-code') and "__new_settings"."base_url" is not null and "__new_settings"."sealed_key" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "provider", "base_url", "model", "sealed_key") SELECT "id", "provider", "base_url", "model", "sealed_key" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;