import { z } from "zod";

export const NOTE_DRAFTS = "threadsift.note-draft.";

export const RESTORE_FINGERPRINTS = "threadsift.restore.";

type StoragePrefix = typeof NOTE_DRAFTS | typeof RESTORE_FINGERPRINTS;

const PREFIXES: readonly StoragePrefix[] = [NOTE_DRAFTS, RESTORE_FINGERPRINTS];

const ENTERED = "threadsift.database";

const EnteredSchema = z.object({ database: z.string().min(1), askedAt: z.number() });

const WHOLE_ID = /^\d+$/u;

function databaseOfKey(key: string): string | null | undefined {
  const prefix = PREFIXES.find((each) => key.startsWith(each));

  if (prefix === undefined) return undefined;

  const parts = key.slice(prefix.length).split(".");
  const [database, id] = parts.length === 1 ? [null, parts[0]] : parts;

  if (parts.length > 2 || database === "" || id === undefined || !WHOLE_ID.test(id)) {
    return undefined;
  }

  return database ?? null;
}

function enteredBefore(): z.infer<typeof EnteredSchema> | null {
  try {
    return EnteredSchema.parse(JSON.parse(localStorage.getItem(ENTERED) ?? "null"));
  } catch {
    return null;
  }
}

export function enterDatabase(database: string, askedAt: number): void {
  try {
    const entered = enteredBefore();

    if (entered !== null && entered.database !== database && entered.askedAt > askedAt) return;

    localStorage.setItem(
      ENTERED,
      JSON.stringify({ database, askedAt: Math.max(askedAt, entered?.askedAt ?? askedAt) }),
    );

    for (const key of Object.keys(localStorage)) {
      const owner = databaseOfKey(key);

      if (owner !== undefined && owner !== database) localStorage.removeItem(key);
    }
  } catch {}
}

function keyOf(prefix: StoragePrefix, database: string, id: number): string {
  return `${prefix}${database}.${String(id)}`;
}

export function readEntry(prefix: StoragePrefix, database: string, id: number): string | null {
  try {
    return localStorage.getItem(keyOf(prefix, database, id));
  } catch {
    return null;
  }
}

export function writeEntry(prefix: StoragePrefix, database: string, id: number, text: string) {
  try {
    localStorage.setItem(keyOf(prefix, database, id), text);
  } catch {}
}

export function removeEntry(prefix: StoragePrefix, database: string, id: number): void {
  try {
    localStorage.removeItem(keyOf(prefix, database, id));
  } catch {}
}
