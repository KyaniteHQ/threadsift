CREATE TABLE `reddit_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`sealed_session` text NOT NULL,
	`state` text NOT NULL,
	`state_at` integer NOT NULL,
	`limited_until` integer,
	`busy_until` integer,
	`busy_job` integer,
	`queue_head` integer,
	`last_request_at` integer,
	`refused_count` integer DEFAULT 0 NOT NULL,
	`refused_job` integer,
	`window_remaining` integer,
	`window_resets_at` integer,
	`connected_at` integer NOT NULL,
	CONSTRAINT "reddit_account_is_one_row" CHECK("reddit_account"."id" = 1),
	CONSTRAINT "reddit_account_state" CHECK("reddit_account"."state" in ('connected', 'expired')),
	CONSTRAINT "reddit_account_refused_count" CHECK("reddit_account"."refused_count" >= 0)
);
