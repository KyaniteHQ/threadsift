CREATE TABLE `threadsift_bot` (
	`id` integer PRIMARY KEY NOT NULL,
	`auto_install` integer DEFAULT true NOT NULL,
	`version` text,
	`skill_version` text,
	`refused` text,
	`reported_at` integer,
	`reported_by` integer,
	CONSTRAINT "threadsift_bot_is_one_row" CHECK("threadsift_bot"."id" = 1),
	CONSTRAINT "threadsift_bot_reported" CHECK(("threadsift_bot"."version" is null) = ("threadsift_bot"."skill_version" is null) and ("threadsift_bot"."version" is null) = ("threadsift_bot"."reported_at" is null) and ("threadsift_bot"."version" is null) = ("threadsift_bot"."reported_by" is null) and ("threadsift_bot"."version" is not null or "threadsift_bot"."refused" is null))
);
