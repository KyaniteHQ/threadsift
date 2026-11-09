CREATE TRIGGER `items_status_reason_insert` BEFORE INSERT ON `items` WHEN NEW.status not in ('processing', 'ready', 'failed') or (NEW.status = 'failed' and (NEW.reason is null or NEW.reason not in ('timeout','network','gave-up','rate-limited'))) or (NEW.status <> 'failed' and NEW.reason is not null) BEGIN
	SELECT RAISE(ABORT, 'items_status_reason: an Item is failed with a known reason, or processing or ready with none');
END;
--> statement-breakpoint
CREATE TRIGGER `items_status_reason_update` BEFORE UPDATE OF `status`, `reason` ON `items` WHEN NEW.status not in ('processing', 'ready', 'failed') or (NEW.status = 'failed' and (NEW.reason is null or NEW.reason not in ('timeout','network','gave-up','rate-limited'))) or (NEW.status <> 'failed' and NEW.reason is not null) BEGIN
	SELECT RAISE(ABORT, 'items_status_reason: an Item is failed with a known reason, or processing or ready with none');
END;
--> statement-breakpoint
CREATE TRIGGER `items_post_text_insert` BEFORE INSERT ON `items` WHEN NEW.post_text is not null and NEW.post_text_key is not null BEGIN
	SELECT RAISE(ABORT, 'items_post_text: an Item keeps its post text in the row or in a file, never both');
END;
--> statement-breakpoint
CREATE TRIGGER `items_post_text_update` BEFORE UPDATE OF `post_text`, `post_text_key` ON `items` WHEN NEW.post_text is not null and NEW.post_text_key is not null BEGIN
	SELECT RAISE(ABORT, 'items_post_text: an Item keeps its post text in the row or in a file, never both');
END;
--> statement-breakpoint
CREATE TRIGGER `items_source_kind_insert` BEFORE INSERT ON `items` WHEN NEW.source is not (case NEW.kind when 'reddit-post' then 'reddit' when 'reddit-comment' then 'reddit' when 'x-post' then 'x' when 'github-repo' then 'github' when 'article' then 'article' when 'link' then 'other' end) BEGIN
	SELECT RAISE(ABORT, 'items_source_kind: an Item has the source its kind belongs to');
END;
--> statement-breakpoint
CREATE TRIGGER `items_source_kind_update` BEFORE UPDATE OF `source`, `kind` ON `items` WHEN NEW.source is not (case NEW.kind when 'reddit-post' then 'reddit' when 'reddit-comment' then 'reddit' when 'x-post' then 'x' when 'github-repo' then 'github' when 'article' then 'article' when 'link' then 'other' end) BEGIN
	SELECT RAISE(ABORT, 'items_source_kind: an Item has the source its kind belongs to');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_insert` BEFORE INSERT ON `jobs` WHEN NEW.kind not in ('fetch', 'digest') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
--> statement-breakpoint
CREATE TRIGGER `jobs_values_update` BEFORE UPDATE OF `kind`, `state` ON `jobs` WHEN NEW.kind not in ('fetch', 'digest') or NEW.state not in ('queued', 'running', 'done') BEGIN
	SELECT RAISE(ABORT, 'jobs_values: a job has a known kind and state');
END;
