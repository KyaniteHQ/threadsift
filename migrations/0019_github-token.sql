CREATE TABLE `github_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`sealed_token` text NOT NULL,
	CONSTRAINT "github_settings_is_one_row" CHECK("github_settings"."id" = 1)
);
