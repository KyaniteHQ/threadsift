CREATE TABLE agent_token_sequence AS
SELECT seq FROM sqlite_sequence WHERE name = 'agent_tokens';
--> statement-breakpoint
CREATE TABLE `__new_agent_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`scopes` text NOT NULL,
	`daily_budget` integer
);
--> statement-breakpoint
INSERT INTO `__new_agent_tokens`("id", "name", "digest", "created_at", "last_used_at", "scopes", "daily_budget") SELECT "id", "name", "digest", "created_at", "last_used_at", "scopes", "daily_budget" FROM `agent_tokens`;--> statement-breakpoint
DROP TABLE `agent_tokens`;--> statement-breakpoint
ALTER TABLE `__new_agent_tokens` RENAME TO `agent_tokens`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq)
SELECT 'agent_tokens', seq FROM agent_token_sequence
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'agent_tokens');
--> statement-breakpoint
UPDATE sqlite_sequence
SET seq = max(seq, (SELECT seq FROM agent_token_sequence))
WHERE name = 'agent_tokens' AND EXISTS (SELECT 1 FROM agent_token_sequence);
--> statement-breakpoint
DROP TABLE agent_token_sequence;
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_digest_unique` ON `agent_tokens` (`digest`);
