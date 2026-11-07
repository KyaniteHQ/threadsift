CREATE VIRTUAL TABLE `search_index` USING fts5(
	body,
	content = 'search_parts',
	content_rowid = 'id',
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `search_parts_insert` AFTER INSERT ON `search_parts` BEGIN
	INSERT INTO `search_index`(rowid, body) VALUES (new.id, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `search_parts_delete` AFTER DELETE ON `search_parts` BEGIN
	INSERT INTO `search_index`(`search_index`, rowid, body) VALUES ('delete', old.id, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `search_parts_update` AFTER UPDATE ON `search_parts` BEGIN
	INSERT INTO `search_index`(`search_index`, rowid, body) VALUES ('delete', old.id, old.body);
	INSERT INTO `search_index`(rowid, body) VALUES (new.id, new.body);
END;
