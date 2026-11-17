CREATE TABLE `agent_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`scopes` text DEFAULT '["read","add","digest","delete"]' NOT NULL,
	`daily_budget` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_digest_unique` ON `agent_tokens` (`digest`);--> statement-breakpoint
CREATE TABLE `ai_settings_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_settings_revision_is_one_row" CHECK("ai_settings_revision"."id" = 1),
	CONSTRAINT "ai_settings_revision_not_negative" CHECK("ai_settings_revision"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `ai_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`inputs` text NOT NULL,
	`input_revision` integer NOT NULL,
	`executor` text NOT NULL,
	`provider` text,
	`model` text,
	`attempts` integer NOT NULL,
	`deadline` integer NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`refusal` text,
	`status` integer,
	`item_id` integer,
	`callback_hash` text,
	`job_id` integer,
	`context` text,
	`sent_at` integer,
	`answered_at` integer,
	`answer_refusals` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_tasks_item` ON `ai_tasks` (`item_id`);--> statement-breakpoint
CREATE INDEX `ai_tasks_job` ON `ai_tasks` (`job_id`);--> statement-breakpoint
CREATE INDEX `ai_tasks_executor_state` ON `ai_tasks` (`executor`,`state`);--> statement-breakpoint
CREATE TABLE `catalog_version` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "catalog_is_one_row" CHECK("catalog_version"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `digests` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`task_id` integer NOT NULL,
	`provider` text,
	`model` text,
	`generation` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`stream` text DEFAULT '' NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`entries` integer DEFAULT 0 NOT NULL,
	`data_bytes` integer DEFAULT 0 NOT NULL,
	`dir_bytes` integer DEFAULT 0 NOT NULL,
	`tail_bytes` integer DEFAULT 0 NOT NULL,
	`parts` integer DEFAULT 0 NOT NULL,
	`tally` text DEFAULT '{}' NOT NULL,
	`failure` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "exports_values_check" CHECK("exports"."state" in ('running', 'ready', 'failed', 'removing', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exports_one_live` ON `exports` (1) WHERE "exports"."state" in ('running', 'ready');--> statement-breakpoint
CREATE TABLE `file_cleaning` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor` text,
	CONSTRAINT "file_cleaning_is_one_row" CHECK("file_cleaning"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `github_cooldown` (
	`id` integer PRIMARY KEY NOT NULL,
	`until` integer NOT NULL,
	CONSTRAINT "github_cooldown_is_one_row" CHECK("github_cooldown"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `github_repos` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`description` text,
	`stars` integer NOT NULL,
	`language` text,
	`license` text,
	`topics` text NOT NULL,
	`pushed_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`sealed_token` text NOT NULL,
	CONSTRAINT "github_settings_is_one_row" CHECK("github_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `grok_bot_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`webhook_url` text NOT NULL,
	`sealed_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	`use_as_provider` integer DEFAULT false NOT NULL,
	CONSTRAINT "grok_bot_settings_is_one_row" CHECK("grok_bot_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `guards` (
	`ok` integer NOT NULL,
	CONSTRAINT "guards_hold" CHECK("guards"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `highlights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`comment_id` text,
	`exact` text NOT NULL,
	`prefix` text NOT NULL,
	`suffix` text NOT NULL,
	`hint` integer NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`start` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "highlights_start_when_attached" CHECK(("highlights"."status" = 'attached') = ("highlights"."start" is not null))
);
--> statement-breakpoint
CREATE INDEX `highlights_item` ON `highlights` (`item_id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`name` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_aliases` (
	`normalized_url` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`item_id` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_aliases_item` ON `item_aliases` (`item_id`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_tags_item_tag` ON `item_tags` (`item_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `item_tags_tag` ON `item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`normalized_url` text NOT NULL,
	`original_url` text NOT NULL,
	`saved_at` integer NOT NULL,
	`title` text,
	`author` text,
	`community` text,
	`post_text` text,
	`post_text_key` text,
	`posted_at` integer,
	`fetched_at` integer,
	`pending_digest` text,
	`topic_id` integer,
	`generation` integer DEFAULT 0 NOT NULL,
	`digest_failed` integer DEFAULT false NOT NULL,
	`read_state` text DEFAULT 'unread' NOT NULL,
	`reason` text,
	`fetch_result` text,
	`x_note` text,
	`added_by_token` integer,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "items_post_text_check" CHECK("items"."post_text" is null or "items"."post_text_key" is null),
	CONSTRAINT "items_reason_check" CHECK("items"."reason" in ('timeout', 'network', 'gave-up', 'rate-limited')),
	CONSTRAINT "items_source_kind_check" CHECK("items"."source" is (case "items"."kind" when 'reddit-post' then 'reddit' when 'reddit-comment' then 'reddit' when 'x-post' then 'x' when 'github-repo' then 'github' when 'article' then 'article' when 'link' then 'other' end))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_normalized_url_unique` ON `items` (`normalized_url`);--> statement-breakpoint
CREATE INDEX `items_saved_at_id` ON `items` (`saved_at`,`id`);--> statement-breakpoint
CREATE INDEX `items_topic` ON `items` (`topic_id`);--> statement-breakpoint
CREATE INDEX `items_post_text_key` ON `items` (`post_text_key`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer,
	`address` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`stale_requeues` integer DEFAULT 0 NOT NULL,
	`attempt_generation` integer,
	`attempt_pending` text,
	`next_attempt_at` integer NOT NULL,
	`claim_expires` integer,
	`wait_reason` text,
	`page` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "jobs_owner_check" CHECK("jobs"."kind" in ('export', 'restore') or "jobs"."item_id" is not null),
	CONSTRAINT "jobs_values_check" CHECK("jobs"."kind" in ('fetch', 'digest', 'x_verify', 'topic_overview', 'related_pick', 'proposals', 'topic_proposals', 'disagreement_proposals', 'export', 'restore') and "jobs"."state" in ('queued', 'running', 'done'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_open_per_item_kind` ON `jobs` (`item_id`,`kind`) WHERE "jobs"."state" <> 'done';--> statement-breakpoint
CREATE INDEX `jobs_state_next_attempt` ON `jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `log_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`title` text,
	`topic` text,
	`tags` text,
	`added` integer,
	`removed` integer,
	`picks` integer,
	`merged_from` text,
	`merged_into` text,
	`moved` integer,
	`item_id` integer,
	`topic_id` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "log_entries_action_check" CHECK("log_entries"."action" in ('ingest', 'digest', 'topic', 'overview', 'related', 'merge', 'merge-topic'))
);
--> statement-breakpoint
CREATE INDEX `log_entries_item` ON `log_entries` (`item_id`);--> statement-breakpoint
CREATE INDEX `log_entries_topic` ON `log_entries` (`topic_id`);--> statement-breakpoint
CREATE TABLE `log_start` (
	`id` integer PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	CONSTRAINT "log_start_is_one_row" CHECK("log_start"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source_url` text NOT NULL,
	`final_url` text,
	`position` integer NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`width` integer,
	`height` integer,
	`outcome` text NOT NULL,
	`reason` text,
	`file_key` text,
	`content_type` text,
	`size` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_video_is_linked" CHECK(("media"."kind" = 'video') = ("media"."outcome" = 'linked')),
	CONSTRAINT "media_failed_has_reason" CHECK(("media"."outcome" = 'failed') = ("media"."reason" is not null)),
	CONSTRAINT "media_stored_has_file" CHECK(("media"."outcome" = 'stored') = ("media"."file_key" is not null and "media"."content_type" is not null and "media"."size" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_item_source` ON `media` (`item_id`,`kind`,`source_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_file_key` ON `media` (`file_key`);--> statement-breakpoint
CREATE TABLE `notes` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`body` text,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
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
CREATE INDEX `openrouter_connect_session` ON `openrouter_connect_transactions` (`session_digest`);--> statement-breakpoint
CREATE TABLE `owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "owner_is_one_row" CHECK("owner"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `pins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`from_key` text NOT NULL,
	`from_name` text NOT NULL,
	`into_tag_id` integer,
	`into_topic_id` integer,
	`from_item_id` integer,
	`into_item_id` integer,
	`from_digest` integer,
	`into_digest` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`into_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pins_subject_check" CHECK(case "pins"."kind" when 'tag-merge' then ("pins"."into_tag_id" is not null and "pins"."into_topic_id" is null and "pins"."from_item_id" is null and "pins"."into_item_id" is null and "pins"."from_digest" is null and "pins"."into_digest" is null) when 'topic-merge' then ("pins"."into_tag_id" is null and "pins"."into_topic_id" is not null and "pins"."from_item_id" is null and "pins"."into_item_id" is null and "pins"."from_digest" is null and "pins"."into_digest" is null) when 'items-disagree' then ("pins"."into_tag_id" is null and "pins"."into_topic_id" is null and "pins"."from_item_id" is not null and "pins"."into_item_id" is not null and "pins"."from_digest" is not null and "pins"."into_digest" is not null) else 1 end and ("pins"."kind" <> 'items-disagree' or "pins"."from_item_id" <> "pins"."into_item_id")),
	CONSTRAINT "pins_values_check" CHECK("pins"."kind" in ('tag-merge', 'topic-merge', 'items-disagree'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pins_kind_key` ON `pins` (`kind`,`from_key`);--> statement-breakpoint
CREATE INDEX `pins_into` ON `pins` (`into_tag_id`);--> statement-breakpoint
CREATE INDEX `pins_into_topic` ON `pins` (`into_topic_id`);--> statement-breakpoint
CREATE INDEX `pins_from_item` ON `pins` (`from_item_id`);--> statement-breakpoint
CREATE INDEX `pins_into_item` ON `pins` (`into_item_id`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`from_tag_id` integer,
	`into_tag_id` integer,
	`from_topic_id` integer,
	`into_topic_id` integer,
	`reason` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`cursor` integer,
	`moved` integer,
	`unit_revision` integer,
	`failed_runs` integer,
	`highlight_id` integer,
	`topic_id` integer,
	`from_item_id` integer,
	`into_item_id` integer,
	`from_digest` integer,
	`into_digest` integer,
	FOREIGN KEY (`from_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`highlight_id`) REFERENCES `highlights`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`into_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "proposals_accepting_check" CHECK("proposals"."state" = 'accepting' or ("proposals"."cursor" is null and "proposals"."moved" is null and "proposals"."unit_revision" is null and "proposals"."failed_runs" is null)),
	CONSTRAINT "proposals_state_check" CHECK("proposals"."state" not in ('accepting', 'declined') or "proposals"."kind" in ('tag-merge', 'topic-merge')),
	CONSTRAINT "proposals_subject_check" CHECK(case "proposals"."kind" when 'tag-merge' then ("proposals"."from_tag_id" is not null and "proposals"."into_tag_id" is not null and "proposals"."from_topic_id" is null and "proposals"."into_topic_id" is null and "proposals"."highlight_id" is null and "proposals"."topic_id" is null and "proposals"."from_item_id" is null and "proposals"."into_item_id" is null and "proposals"."from_digest" is null and "proposals"."into_digest" is null) when 'topic-merge' then ("proposals"."from_tag_id" is null and "proposals"."into_tag_id" is null and "proposals"."from_topic_id" is not null and "proposals"."into_topic_id" is not null and "proposals"."highlight_id" is null and "proposals"."topic_id" is null and "proposals"."from_item_id" is null and "proposals"."into_item_id" is null and "proposals"."from_digest" is null and "proposals"."into_digest" is null) when 'highlight-lost' then ("proposals"."from_tag_id" is null and "proposals"."into_tag_id" is null and "proposals"."from_topic_id" is null and "proposals"."into_topic_id" is null and "proposals"."highlight_id" is not null and "proposals"."topic_id" is null and "proposals"."from_item_id" is null and "proposals"."into_item_id" is null and "proposals"."from_digest" is null and "proposals"."into_digest" is null) when 'overview-gap' then ("proposals"."from_tag_id" is null and "proposals"."into_tag_id" is null and "proposals"."from_topic_id" is null and "proposals"."into_topic_id" is null and "proposals"."highlight_id" is null and "proposals"."topic_id" is not null and "proposals"."from_item_id" is null and "proposals"."into_item_id" is null and "proposals"."from_digest" is null and "proposals"."into_digest" is null) when 'items-disagree' then ("proposals"."from_tag_id" is null and "proposals"."into_tag_id" is null and "proposals"."from_topic_id" is null and "proposals"."into_topic_id" is null and "proposals"."highlight_id" is null and "proposals"."topic_id" is null and "proposals"."from_item_id" is not null and "proposals"."into_item_id" is not null and "proposals"."from_digest" is not null and "proposals"."into_digest" is not null) else 1 end and ("proposals"."kind" <> 'items-disagree' or "proposals"."from_item_id" <> "proposals"."into_item_id")),
	CONSTRAINT "proposals_values_check" CHECK("proposals"."kind" in ('tag-merge', 'topic-merge', 'highlight-lost', 'overview-gap', 'items-disagree') and "proposals"."state" in ('open', 'accepting', 'rejected', 'declined')),
	CONSTRAINT "proposals_distinct" CHECK("proposals"."from_tag_id" <> "proposals"."into_tag_id"),
	CONSTRAINT "proposals_topic_distinct" CHECK("proposals"."from_topic_id" <> "proposals"."into_topic_id"),
	CONSTRAINT "proposals_open_reason" CHECK("proposals"."state" <> 'open' or length(coalesce("proposals"."reason", '')) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_highlight` ON `proposals` (`highlight_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_overview_topic` ON `proposals` (`topic_id`);--> statement-breakpoint
CREATE INDEX `proposals_from` ON `proposals` (`from_tag_id`);--> statement-breakpoint
CREATE INDEX `proposals_into` ON `proposals` (`into_tag_id`);--> statement-breakpoint
CREATE INDEX `proposals_from_topic` ON `proposals` (`from_topic_id`);--> statement-breakpoint
CREATE INDEX `proposals_into_topic` ON `proposals` (`into_topic_id`);--> statement-breakpoint
CREATE INDEX `proposals_from_item` ON `proposals` (`from_item_id`);--> statement-breakpoint
CREATE INDEX `proposals_into_item` ON `proposals` (`into_item_id`);--> statement-breakpoint
CREATE INDEX `proposals_state` ON `proposals` (`state`,`id`);--> statement-breakpoint
CREATE TABLE `reddit_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`sealed_session` text NOT NULL,
	`state` text NOT NULL,
	`state_at` integer NOT NULL,
	`limited_until` integer,
	`busy_until` integer,
	`busy_job` integer,
	`busy_attempt` integer,
	`queue_head` integer,
	`last_request_at` integer,
	`refused_count` integer DEFAULT 0 NOT NULL,
	`refused_threads` text DEFAULT '[]' NOT NULL,
	`refusals_cleared_at` integer,
	`window_remaining` integer,
	`window_resets_at` integer,
	`connected_at` integer NOT NULL,
	CONSTRAINT "reddit_account_is_one_row" CHECK("reddit_account"."id" = 1),
	CONSTRAINT "reddit_account_state" CHECK("reddit_account"."state" in ('connected', 'expired')),
	CONSTRAINT "reddit_account_refused_count" CHECK("reddit_account"."refused_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `reddit_comments` (
	`item_id` integer NOT NULL,
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
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reddit_comments_id` ON `reddit_comments` (`item_id`,`generation`,`id`);--> statement-breakpoint
CREATE TABLE `reddit_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`archive_fill` integer NOT NULL,
	CONSTRAINT "reddit_settings_is_one_row" CHECK("reddit_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `reddit_threads` (
	`item_id` integer NOT NULL,
	`generation` integer NOT NULL,
	`reported` integer,
	`archived_at` integer,
	`linked_url` text,
	`post_link` text,
	`follow_ups` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `generation`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE INDEX `related_items_related` ON `related_items` (`related_id`);--> statement-breakpoint
CREATE TABLE `restores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state` text NOT NULL,
	`phase` text DEFAULT 'upload' NOT NULL,
	`cursor` text DEFAULT '{}' NOT NULL,
	`restored` text DEFAULT '{}' NOT NULL,
	`dropped` text DEFAULT '{}' NOT NULL,
	`writing` integer DEFAULT 0 NOT NULL,
	`bytes` integer NOT NULL,
	`parts` integer NOT NULL,
	`part_bytes` integer NOT NULL,
	`failure` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT "restores_values_check" CHECK("restores"."state" in ('uploading', 'running', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restores_one_open` ON `restores` (1) WHERE "restores"."state" not in ('done', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE `scheduled_runs` (
	`task` text PRIMARY KEY NOT NULL,
	`last_run_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`highlight_id` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`highlight_id`) REFERENCES `highlights`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `search_parts_item` ON `search_parts` (`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_parts_highlight` ON `search_parts` (`highlight_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`digest` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`base_url` text,
	`model` text NOT NULL,
	`sealed_key` text,
	CONSTRAINT "settings_is_one_row" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_connection_columns" CHECK(("settings"."provider" in ('workers-ai', 'claude-code', 'codex') and "settings"."base_url" is null and "settings"."sealed_key" is null) or ("settings"."provider" not in ('workers-ai', 'claude-code', 'codex') and "settings"."base_url" is not null and "settings"."sealed_key" is not null))
);
--> statement-breakpoint
CREATE TABLE `spent_reset_codes` (
	`digest` text PRIMARY KEY NOT NULL,
	`spent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_key_unique` ON `tags` (`key`);--> statement-breakpoint
CREATE TABLE `throttles` (
	`kind` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`locked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic_checks` (
	`topic_id` integer PRIMARY KEY NOT NULL,
	`members` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_pages` (
	`topic_id` integer PRIMARY KEY NOT NULL,
	`overview` text,
	`revision` integer NOT NULL,
	`built_from` text NOT NULL,
	`failure` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_key_unique` ON `topics` (`key`);--> statement-breakpoint
CREATE TABLE `x_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`reader` text NOT NULL,
	CONSTRAINT "x_settings_is_one_row" CHECK("x_settings"."id" = 1),
	CONSTRAINT "x_settings_reader" CHECK("x_settings"."reader" in ('auto', 'grok-bot', 'grok-cli'))
);
--> statement-breakpoint
CREATE TABLE `x_verifications` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`thread` text NOT NULL,
	`digest` text,
	`judged` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE VIRTUAL TABLE `search_index` USING fts5(
	body,
	content = 'search_parts',
	content_rowid = 'id',
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `items_restoring` BEFORE INSERT ON `items` WHEN EXISTS (SELECT 1 FROM `restores` WHERE (`state` = 'running' OR (`state` = 'failed' AND `failure` = 'gave-up')) AND `writing` = 0 AND `id` = (SELECT max(`id`) FROM `restores`)) BEGIN
	SELECT RAISE(ABORT, 'items_restoring: a restore holds the library, so only the restore adds Items');
END;
--> statement-breakpoint
CREATE TRIGGER `search_parts_delete` AFTER DELETE ON `search_parts` BEGIN
	INSERT INTO `search_index`(`search_index`, rowid, body) VALUES ('delete', old.id, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `search_parts_insert` AFTER INSERT ON `search_parts` BEGIN
	INSERT INTO `search_index`(rowid, body) VALUES (new.id, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `search_parts_update` AFTER UPDATE ON `search_parts` BEGIN
	INSERT INTO `search_index`(`search_index`, rowid, body) VALUES ('delete', old.id, old.body);
	INSERT INTO `search_index`(rowid, body) VALUES (new.id, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_delete` AFTER DELETE ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_insert` AFTER INSERT ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_revision_update` AFTER UPDATE ON `settings` BEGIN
	UPDATE `ai_settings_revision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_item_pair` ON `proposals` (min(`from_item_id`, `into_item_id`), max(`from_item_id`, `into_item_id`));
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_pair` ON `proposals` (min(`from_tag_id`, `into_tag_id`), max(`from_tag_id`, `into_tag_id`));
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_topic_pair` ON `proposals` (min(`from_topic_id`, `into_topic_id`), max(`from_topic_id`, `into_topic_id`));
--> statement-breakpoint
INSERT INTO ai_settings_revision (id, revision) VALUES (1, 0);
--> statement-breakpoint
INSERT INTO catalog_version (id, version) VALUES (1, 0);
--> statement-breakpoint
INSERT INTO log_start (id, started_at) VALUES (1, CAST(unixepoch('subsec') * 1000 AS integer));
