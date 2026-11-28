export const NOTE_DRAFTS = "threadsift.note-draft.";

export const RESTORE_FINGERPRINTS = "threadsift.restore.";

type StoragePrefix = typeof NOTE_DRAFTS | typeof RESTORE_FINGERPRINTS;

const PREFIXES: readonly StoragePrefix[] = [NOTE_DRAFTS, RESTORE_FINGERPRINTS];

let current: string | null = null;

function ofAnotherDatabase(key: string, database: string): boolean {
  return PREFIXES.some(
    (prefix) => key.startsWith(prefix) && !key.startsWith(`${prefix}${database}.`),
  );
}

export function enterDatabase(database: string): void {
  if (current === database) return;

  current = database;

  try {
    for (const key of Object.keys(localStorage)) {
      if (ofAnotherDatabase(key, database)) localStorage.removeItem(key);
    }
  } catch {}
}

export function databaseKey(prefix: StoragePrefix, id: number): string | null {
  return current === null ? null : `${prefix}${current}.${String(id)}`;
}
