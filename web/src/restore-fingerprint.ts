import { RESTORE_FINGERPRINTS, databaseKey } from "./database-storage.ts";

type Chosen = Readonly<Pick<File, "name" | "size" | "lastModified">>;

function fingerprintOf({ name, size, lastModified }: Chosen): string {
  return `${name}|${String(size)}|${String(lastModified)}`;
}

export function rememberFingerprint(id: number, file: Chosen): void {
  const key = databaseKey(RESTORE_FINGERPRINTS, id);

  if (key === null) return;

  try {
    localStorage.setItem(key, fingerprintOf(file));
  } catch {}
}

export function matchesFingerprint(id: number, file: Chosen): boolean {
  const key = databaseKey(RESTORE_FINGERPRINTS, id);

  try {
    const stored = key === null ? null : localStorage.getItem(key);

    return stored === null || stored === fingerprintOf(file);
  } catch {
    return true;
  }
}
