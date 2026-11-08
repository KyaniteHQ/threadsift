CREATE TABLE `ai_settings_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_settings_revision_is_one_row" CHECK("ai_settings_revision"."id" = 1),
	CONSTRAINT "ai_settings_revision_not_negative" CHECK("ai_settings_revision"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `openrouter_connect_transactions` (
	`state_digest` text PRIMARY KEY NOT NULL,
	`session_digest` text NOT NULL,
	`sealed_verifier` text NOT NULL,
	`model` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`public_origin` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`session_digest`) REFERENCES `sessions`(`digest`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "openrouter_connect_revision_not_negative" CHECK("openrouter_connect_transactions"."expected_revision" >= 0),
	CONSTRAINT "openrouter_connect_expires_after_created" CHECK("openrouter_connect_transactions"."expires_at" > "openrouter_connect_transactions"."created_at")
);
--> statement-breakpoint
CREATE INDEX `openrouter_connect_expires_at` ON `openrouter_connect_transactions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `openrouter_connect_session` ON `openrouter_connect_transactions` (`session_digest`);