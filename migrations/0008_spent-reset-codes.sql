CREATE TABLE `spent_reset_codes` (
	`digest` text PRIMARY KEY NOT NULL,
	`spent_at` integer NOT NULL
);
