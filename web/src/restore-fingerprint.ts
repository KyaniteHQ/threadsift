import { RESTORE_FINGERPRINTS, readEntry, writeEntry } from "./database-storage.ts";

type Chosen = Readonly<Pick<File, "name" | "size" | "lastModified">>;

function fingerprintOf({ name, size, lastModified }: Chosen): string {
  return `${name}|${String(size)}|${String(lastModified)}`;
}

export function rememberFingerprint(database: string, id: number, file: Chosen): void {
  writeEntry(RESTORE_FINGERPRINTS, database, id, fingerprintOf(file));
}

export function matchesFingerprint(database: string, id: number, file: Chosen): boolean {
  const stored = readEntry(RESTORE_FINGERPRINTS, database, id);

  return stored === null || stored === fingerprintOf(file);
}
