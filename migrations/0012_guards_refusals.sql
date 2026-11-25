PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_guards` (
	`ok` integer NOT NULL,
	CONSTRAINT "guards_write" CHECK("__new_guards"."ok" <> 0),
	CONSTRAINT "guards_restore" CHECK("__new_guards"."ok" <> 2),
	CONSTRAINT "guards_outcome" CHECK("__new_guards"."ok" <> 3)
);
--> statement-breakpoint
INSERT INTO `__new_guards`("ok") SELECT "ok" FROM `guards`;--> statement-breakpoint
DROP TABLE `guards`;--> statement-breakpoint
ALTER TABLE `__new_guards` RENAME TO `guards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;