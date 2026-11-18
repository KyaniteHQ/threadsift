ALTER TABLE settings ADD COLUMN cli_choice text DEFAULT 'custom' NOT NULL CONSTRAINT settings_cli_choice CHECK (cli_choice = 'custom' or (cli_choice in ('recommended', 'cli-defaults') and provider in ('claude-code', 'codex') and model = '' and effort is null));
--> statement-breakpoint
UPDATE settings SET cli_choice = 'recommended' WHERE provider in ('claude-code', 'codex') AND model = '' AND effort IS NULL;
