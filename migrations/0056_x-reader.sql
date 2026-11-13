CREATE TABLE `x_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`reader` text NOT NULL,
	CONSTRAINT "x_settings_is_one_row" CHECK("x_settings"."id" = 1),
	CONSTRAINT "x_settings_reader" CHECK("x_settings"."reader" in ('auto', 'grok-bot', 'grok-cli'))
);
--> statement-breakpoint
ALTER TABLE `items` ADD `x_note` text;