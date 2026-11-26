CREATE TABLE `threads` (
	`item_id` integer NOT NULL,
	`source` text NOT NULL,
	`generation` integer NOT NULL,
	`reported` integer,
	`archived_at` integer,
	`linked_url` text,
	`post_link` text,
	`follow_ups` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `generation`),
	FOREIGN KEY (`item_id`,`source`) REFERENCES `items`(`id`,`source`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "threads_source_check" CHECK("threads"."source" in ('reddit', 'x'))
);
--> statement-breakpoint
INSERT INTO `threads`("item_id", "source", "generation", "reported", "archived_at", "linked_url", "post_link", "follow_ups") SELECT "item_id", "source", "generation", "reported", "archived_at", "linked_url", "post_link", "follow_ups" FROM `reddit_threads`;--> statement-breakpoint
CREATE TABLE `thread_comments` (
	`item_id` integer NOT NULL,
	`source` text NOT NULL,
	`generation` integer NOT NULL,
	`position` integer NOT NULL,
	`id` text NOT NULL,
	`parent_id` text,
	`depth` integer NOT NULL,
	`kind` text NOT NULL,
	`author` text,
	`body` text,
	`score` integer,
	`posted_at` integer,
	`eligible` integer NOT NULL,
	`kept` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`item_id`, `generation`, `position`),
	FOREIGN KEY (`item_id`,`source`) REFERENCES `items`(`id`,`source`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "thread_comments_source_check" CHECK("thread_comments"."source" in ('reddit', 'x'))
);
--> statement-breakpoint
INSERT INTO `thread_comments`("item_id", "source", "generation", "position", "id", "parent_id", "depth", "kind", "author", "body", "score", "posted_at", "eligible", "kept") SELECT "item_id", "source", "generation", "position", CASE WHEN "id" GLOB '[tT]1_[A-Za-z0-9]*' AND substr("id", 4) NOT GLOB '*[^A-Za-z0-9]*' AND length("id") <= 32 THEN substr("id", 4) ELSE "id" END, CASE WHEN "parent_id" GLOB '[tT]1_[A-Za-z0-9]*' AND substr("parent_id", 4) NOT GLOB '*[^A-Za-z0-9]*' AND length("parent_id") <= 32 THEN substr("parent_id", 4) ELSE "parent_id" END, "depth", "kind", "author", "body", "score", "posted_at", "eligible", "kept" FROM `reddit_comments`;--> statement-breakpoint
CREATE UNIQUE INDEX `thread_comments_id` ON `thread_comments` (`item_id`,`generation`,`id`);--> statement-breakpoint
DROP TABLE `reddit_comments`;--> statement-breakpoint
DROP TABLE `reddit_threads`;--> statement-breakpoint
UPDATE `highlights` SET `comment_id` = substr(`comment_id`, 4) WHERE `comment_id` GLOB '[tT]1_[A-Za-z0-9]*' AND substr(`comment_id`, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(`comment_id`) <= 32;--> statement-breakpoint
UPDATE `digests` SET `digest` = json_set(`digest`, '$.keptComments', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`digest` -> fullkey) END ORDER BY key) FROM json_each(`digest`, '$.keptComments')))) WHERE CASE WHEN json_valid(`digest`) IS NOT 1 THEN 0 WHEN json_type(`digest`, '$.keptComments') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`digest`, '$.keptComments') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;--> statement-breakpoint
UPDATE `items` SET `pending_digest` = json_set(`pending_digest`, '$.keptComments', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`pending_digest` -> fullkey) END ORDER BY key) FROM json_each(`pending_digest`, '$.keptComments')))) WHERE CASE WHEN json_valid(`pending_digest`) IS NOT 1 THEN 0 WHEN json_type(`pending_digest`, '$.keptComments') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`pending_digest`, '$.keptComments') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;--> statement-breakpoint
UPDATE `jobs` SET `attempt_pending` = json_set(`attempt_pending`, '$.keptComments', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`attempt_pending` -> fullkey) END ORDER BY key) FROM json_each(`attempt_pending`, '$.keptComments')))) WHERE CASE WHEN json_valid(`attempt_pending`) IS NOT 1 THEN 0 WHEN json_type(`attempt_pending`, '$.keptComments') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`attempt_pending`, '$.keptComments') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;--> statement-breakpoint
UPDATE `x_verifications` SET `digest` = json_set(`digest`, '$.keptComments', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`digest` -> fullkey) END ORDER BY key) FROM json_each(`digest`, '$.keptComments')))) WHERE CASE WHEN json_valid(`digest`) IS NOT 1 THEN 0 WHEN json_type(`digest`, '$.keptComments') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`digest`, '$.keptComments') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;--> statement-breakpoint
UPDATE `ai_tasks` SET `context` = json_set(`context`, '$.submitted', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`context` -> fullkey) END ORDER BY key) FROM json_each(`context`, '$.submitted')))) WHERE `kind` = 'digest' AND CASE WHEN json_valid(`context`) IS NOT 1 THEN 0 WHEN json_type(`context`, '$.submitted') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`context`, '$.submitted') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;--> statement-breakpoint
UPDATE `ai_tasks` SET `result` = json_set(`result`, '$.keptComments', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`result` -> fullkey) END ORDER BY key) FROM json_each(`result`, '$.keptComments')))) WHERE `kind` = 'digest' AND CASE WHEN json_valid(`result`) IS NOT 1 THEN 0 WHEN json_type(`result`, '$.keptComments') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`result`, '$.keptComments') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;--> statement-breakpoint
UPDATE `ai_tasks` SET `inputs` = json_set(`inputs`, '$.keptComments', json((SELECT json_group_array(CASE WHEN type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32 THEN substr(value, 4) ELSE json(`inputs` -> fullkey) END ORDER BY key) FROM json_each(`inputs`, '$.keptComments')))) WHERE `kind` = 'digest' AND `executor` = 'caller' AND CASE WHEN json_valid(`inputs`) IS NOT 1 THEN 0 WHEN json_type(`inputs`, '$.keptComments') IS NOT 'array' THEN 0 ELSE EXISTS (SELECT 1 FROM json_each(`inputs`, '$.keptComments') WHERE type = 'text' AND value GLOB '[tT]1_[A-Za-z0-9]*' AND substr(value, 4) NOT GLOB '*[^A-Za-z0-9]*' AND length(value) <= 32) END;
