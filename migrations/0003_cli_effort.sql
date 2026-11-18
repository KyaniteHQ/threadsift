ALTER TABLE settings ADD COLUMN effort text CONSTRAINT settings_effort_provider CHECK ("settings"."effort" is null or "settings"."provider" in ('claude-code', 'codex'));
