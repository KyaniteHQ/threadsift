CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source_url` text NOT NULL,
	`final_url` text,
	`position` integer NOT NULL,
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
CREATE UNIQUE INDEX `media_file_key` ON `media` (`file_key`);