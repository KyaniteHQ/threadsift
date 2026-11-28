CREATE TABLE `database_identity` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "database_identity_is_one_row" CHECK("database_identity"."id" = 1)
);
--> statement-breakpoint
INSERT INTO database_identity (id, value) VALUES (1, lower(hex(randomblob(16))));
