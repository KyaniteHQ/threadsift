DROP TRIGGER `items_token_budget`;--> statement-breakpoint
DROP TABLE `agent_token_days`;--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `budget_slot_day`;
