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
