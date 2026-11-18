CREATE TABLE `__new_vault_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'github' NOT NULL,
	`folder` text,
	`repository` text,
	`branch` text,
	`sealed_token` text,
	`generation` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`rate_failures` integer DEFAULT 0 NOT NULL,
	`scan_pending` integer DEFAULT true NOT NULL,
	`wiki_pending` integer DEFAULT true NOT NULL,
	CONSTRAINT "vault_settings_one_row" CHECK("__new_vault_settings"."id" = 1),
	CONSTRAINT "vault_settings_target" CHECK(("__new_vault_settings"."mode" = 'github' and "__new_vault_settings"."repository" is not null and "__new_vault_settings"."branch" is not null and "__new_vault_settings"."sealed_token" is not null and "__new_vault_settings"."folder" is null)
        or ("__new_vault_settings"."mode" = 'folder' and "__new_vault_settings"."folder" is not null and "__new_vault_settings"."repository" is null and "__new_vault_settings"."branch" is null and "__new_vault_settings"."sealed_token" is null))
);
--> statement-breakpoint
INSERT INTO `__new_vault_settings`("id", "mode", "folder", "repository", "branch", "sealed_token", "generation", "lease_until", "next_attempt_at", "rate_failures", "scan_pending", "wiki_pending") SELECT "id", 'github', NULL, "repository", "branch", "sealed_token", "generation", "lease_until", "next_attempt_at", "rate_failures", "scan_pending", "wiki_pending" FROM `vault_settings`;--> statement-breakpoint
DROP TABLE `vault_settings`;--> statement-breakpoint
ALTER TABLE `__new_vault_settings` RENAME TO `vault_settings`;
