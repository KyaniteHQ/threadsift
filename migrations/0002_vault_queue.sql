CREATE TRIGGER vault_paste_insert AFTER INSERT ON items WHEN EXISTS (SELECT 1 FROM vault_settings) BEGIN
  INSERT INTO mirror_paths(item_id) VALUES (NEW.id) ON CONFLICT(item_id) DO UPDATE SET sequence = excluded.sequence;
END;
--> statement-breakpoint
CREATE TRIGGER vault_paste_update AFTER UPDATE OF pending_digest ON items WHEN EXISTS (SELECT 1 FROM vault_settings) BEGIN
  INSERT INTO mirror_paths(item_id) VALUES (NEW.id) ON CONFLICT(item_id) DO UPDATE SET sequence = excluded.sequence;
END;
--> statement-breakpoint
CREATE TRIGGER vault_settings_insert AFTER INSERT ON vault_settings BEGIN
  INSERT INTO mirror_paths(item_id) SELECT id FROM items WHERE true ON CONFLICT(item_id) DO UPDATE SET sequence = excluded.sequence;
END;
--> statement-breakpoint
CREATE TRIGGER vault_settings_update AFTER UPDATE OF sealed_token ON vault_settings BEGIN
  INSERT INTO mirror_paths(item_id) SELECT id FROM items WHERE true ON CONFLICT(item_id) DO UPDATE SET sequence = excluded.sequence;
END;
--> statement-breakpoint
CREATE TRIGGER vault_restore_start AFTER UPDATE OF state ON restores WHEN NEW.state = 'running' AND OLD.state = 'uploading' BEGIN
  UPDATE vault_settings SET generation = generation + 1, lease_until = 0;
END;
--> statement-breakpoint
CREATE TRIGGER vault_restore_finish AFTER UPDATE OF state ON restores WHEN NEW.state IN ('done', 'cancelled') AND EXISTS (SELECT 1 FROM vault_settings) BEGIN
  INSERT INTO mirror_paths(item_id) SELECT id FROM items WHERE true ON CONFLICT(item_id) DO UPDATE SET sequence = excluded.sequence;
  INSERT INTO mirror_paths(item_id) SELECT item_id FROM mirror_files WHERE true ON CONFLICT(item_id) DO UPDATE SET sequence = excluded.sequence;
END;
