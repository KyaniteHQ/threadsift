UPDATE `restores` SET `state` = 'cancelled', `failure` = NULL, `finished_at` = `updated_at` WHERE `state` = 'failed' AND `failure` = 'gave-up' AND `id` <> (SELECT max(`id`) FROM `restores`);--> statement-breakpoint
DROP INDEX IF EXISTS `restores_one_open`;--> statement-breakpoint
CREATE UNIQUE INDEX `restores_one_open` ON `restores` (1) WHERE ("restores"."state" = 'uploading' or "restores"."state" = 'running' or ("restores"."state" = 'failed' and "restores"."failure" = 'gave-up'));
