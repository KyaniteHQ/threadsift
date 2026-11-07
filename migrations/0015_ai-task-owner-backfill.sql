UPDATE `ai_tasks` SET `item_id` = `d`.`item_id` FROM `digests` AS `d` WHERE `d`.`task_id` = `ai_tasks`.`id` AND `ai_tasks`.`item_id` IS NULL;
