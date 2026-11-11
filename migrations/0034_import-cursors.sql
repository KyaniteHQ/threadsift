CREATE TABLE `imports` (
	`name` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
