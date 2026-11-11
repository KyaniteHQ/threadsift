CREATE TABLE `related_items` (
	`item_id` integer NOT NULL,
	`related_id` integer NOT NULL,
	`position` integer NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`item_id`, `related_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "related_items_distinct" CHECK("related_items"."item_id" <> "related_items"."related_id"),
	CONSTRAINT "related_items_position_range" CHECK("related_items"."position" between 0 and 4),
	CONSTRAINT "related_items_reason" CHECK(length("related_items"."reason") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `related_items_position` ON `related_items` (`item_id`,`position`);--> statement-breakpoint
CREATE INDEX `related_items_related` ON `related_items` (`related_id`);
--> statement-breakpoint
DROP TRIGGER `jobs_values_insert`;
--> statement-breakpoint
DROP TRIGGER `jobs_values_update`;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest', 'topic_overview', 'related_pick') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
