CREATE TABLE `file_cleaning` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor` text,
	CONSTRAINT "file_cleaning_is_one_row" CHECK("file_cleaning"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX `items_post_text_key` ON `items` (`post_text_key`);