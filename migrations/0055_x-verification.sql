CREATE TABLE `x_verifications` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`thread` text NOT NULL,
	`digest` text,
	`judged` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TRIGGER `jobs_values_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_values_update`;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
