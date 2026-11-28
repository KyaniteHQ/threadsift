CREATE TABLE `x_api_item_spend` (
	`item_id` integer NOT NULL,
	`day` text NOT NULL,
	`micros` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `day`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "x_api_item_spend_micros" CHECK("x_api_item_spend"."micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE `x_api_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`sealed_token` text,
	`item_limit_micros` integer DEFAULT 1000000 NOT NULL,
	`day_limit_micros` integer DEFAULT 3000000 NOT NULL,
	CONSTRAINT "x_api_settings_is_one_row" CHECK("x_api_settings"."id" = 1),
	CONSTRAINT "x_api_settings_limits" CHECK("x_api_settings"."item_limit_micros" > 0 and "x_api_settings"."day_limit_micros" >= "x_api_settings"."item_limit_micros")
);
--> statement-breakpoint
CREATE TABLE `x_api_spend` (
	`day` text PRIMARY KEY NOT NULL,
	`micros` integer DEFAULT 0 NOT NULL,
	`posts` integer DEFAULT 0 NOT NULL,
	`users` integer DEFAULT 0 NOT NULL,
	`x_posts` integer,
	CONSTRAINT "x_api_spend_counts" CHECK("x_api_spend"."micros" >= 0 and "x_api_spend"."posts" >= 0 and "x_api_spend"."users" >= 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_x_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`reader` text NOT NULL,
	CONSTRAINT "x_settings_is_one_row" CHECK("__new_x_settings"."id" = 1),
	CONSTRAINT "x_settings_reader" CHECK("__new_x_settings"."reader" in ('auto', 'grok-bot', 'grok-cli', 'x-api'))
);
--> statement-breakpoint
INSERT INTO `__new_x_settings`("id", "reader") SELECT "id", "reader" FROM `x_settings`;--> statement-breakpoint
DROP TABLE `x_settings`;--> statement-breakpoint
ALTER TABLE `__new_x_settings` RENAME TO `x_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `threads` ADD `x_api_read` integer DEFAULT false NOT NULL;