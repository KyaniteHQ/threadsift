ALTER TABLE `ai_tasks` ADD `item_id` integer REFERENCES items(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `ai_tasks_item` ON `ai_tasks` (`item_id`);
