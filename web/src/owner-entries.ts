import { SETTINGS } from "./access-text.ts";
import { EXPORT_TEXT } from "./export-text.ts";
import { IMPORT } from "./import-text.ts";
import {
  BACKUP_ID,
  BACKUP_SETTINGS_PATH,
  IMPORT_PATH,
  SETTINGS_PATH,
  TOKENS_ID,
  TOKENS_SETTINGS_PATH,
} from "./routing.ts";

export interface OwnerEntry {
  readonly path: string;
  readonly section: string | null;
  readonly label: string;
}

export const OWNER_ENTRIES: readonly OwnerEntry[] = [
  { path: SETTINGS_PATH, section: null, label: SETTINGS.instanceSettings },
  { path: TOKENS_SETTINGS_PATH, section: TOKENS_ID, label: SETTINGS.tokensTitle },
  { path: BACKUP_SETTINGS_PATH, section: BACKUP_ID, label: EXPORT_TEXT.sectionTitle },
  { path: IMPORT_PATH, section: null, label: IMPORT.settingsLink },
];
