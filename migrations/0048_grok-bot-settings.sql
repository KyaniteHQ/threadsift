CREATE TABLE `grok_bot_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`webhook_url` text NOT NULL,
	`sealed_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "grok_bot_settings_is_one_row" CHECK("grok_bot_settings"."id" = 1)
);
