ALTER TABLE `items` ADD `budget_slot_day` text;--> statement-breakpoint
DROP TRIGGER `items_token_budget`;
--> statement-breakpoint
CREATE TRIGGER `items_token_budget` AFTER INSERT ON `items` WHEN NEW.added_by_token IS NOT NULL AND NEW.budget_slot_day IS NOT date(NEW.saved_at / 1000, 'unixepoch') BEGIN
	INSERT INTO `agent_token_days` (`token_id`, `day`, `added`) SELECT `id`, date(NEW.saved_at / 1000, 'unixepoch'), 1 FROM `agent_tokens` WHERE `id` = NEW.added_by_token ON CONFLICT (`token_id`, `day`) DO UPDATE SET `added` = `added` + 1;
	SELECT RAISE(ABORT, 'agent_token_budget: the agent token has added its daily budget of Items') WHERE EXISTS (SELECT 1 FROM `agent_token_days` AS `spent` INNER JOIN `agent_tokens` AS `token` ON `token`.`id` = `spent`.`token_id` WHERE `spent`.`token_id` = NEW.added_by_token AND `spent`.`day` = date(NEW.saved_at / 1000, 'unixepoch') AND `token`.`daily_budget` IS NOT NULL AND `spent`.`added` > `token`.`daily_budget`);
END;
