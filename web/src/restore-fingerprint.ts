type Chosen = Readonly<Pick<File, "name" | "size" | "lastModified">>;

function keyOf(id: number): string {
  return `threadsift.restore.${String(id)}`;
}

function fingerprintOf({ name, size, lastModified }: Chosen): string {
  return `${name}|${String(size)}|${String(lastModified)}`;
}

export function rememberFingerprint(id: number, file: Chosen): void {
  try {
    localStorage.setItem(keyOf(id), fingerprintOf(file));
  } catch {}
}

export function matchesFingerprint(id: number, file: Chosen): boolean {
  try {
    const stored = localStorage.getItem(keyOf(id));

    return stored === null || stored === fingerprintOf(file);
  } catch {
    return true;
  }
}
