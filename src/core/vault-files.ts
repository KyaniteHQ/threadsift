import { planOf } from "./export-plan.ts";
import { readItem } from "./item-detail.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { VaultFile, vaultGithub } from "./vault-github.ts";
import { type PendingVaultNote, VaultItemFailure, parkVaultNote } from "./vault-queue.ts";

interface Reader {
  readonly ports: JobPorts;
  readonly github: Readonly<ReturnType<typeof vaultGithub>>;
  readonly signal: AbortSignal;
}

export interface VaultBatch {
  readonly pending: readonly PendingVaultNote[];
  readonly files: readonly VaultFile[];
}

async function itemFiles(reader: Reader, subjectId: number): Promise<readonly VaultFile[]> {
  reader.signal.throwIfAborted();
  const read = await readItem(reader.ports, subjectId);
  reader.signal.throwIfAborted();
  if (read === undefined) return [];
  const planned = planOf({
    item: read.item,
    keptNodes: read.keptNodes(),
    postTextKey: read.postTextKey,
    storedFiles: read.storedFiles,
  });
  if (planned.kind === "missing") throw new VaultItemFailure({ subjectId, reason: "file-missing" });
  const [note, ...text] = planned.plan.head;
  if (note === undefined) throw new VaultItemFailure({ subjectId, reason: "item-unreadable" });
  return [
    {
      subjectId,
      path: `Threadsift/items/${String(subjectId)}/note-${String(subjectId)}.md`,
      kind: "text",
      content: new TextDecoder().decode(note.bytes),
    },
    ...text.map(({ name, bytes }) => ({
      subjectId,
      path: `Threadsift/${name}`,
      kind: "text" as const,
      content: new TextDecoder().decode(bytes),
    })),
    ...planned.plan.stored.map(({ key, size }) => ({
      subjectId,
      path: `Threadsift/${key}`,
      kind: "binary" as const,
      key,
      size,
    })),
  ];
}

async function filesOfItem(reader: Reader, subjectId: number): Promise<readonly VaultFile[]> {
  const files = await itemFiles(reader, subjectId);
  const paths = new Set(files.map(({ path }) => path));
  const previous = await reader.github.files(subjectId);
  return [
    ...files,
    ...previous
      .filter((path) => !paths.has(path))
      .map((path) => ({ subjectId, path, kind: "delete" as const, content: null })),
  ];
}

function textBytes(files: readonly VaultFile[]): number {
  return files.reduce(
    (sum, file) => sum + (file.kind === "text" ? new TextEncoder().encode(file.content).length : 0),
    0,
  );
}

async function take(
  reader: Reader,
  pending: readonly PendingVaultNote[],
  taken: VaultBatch,
  bytes: number,
): Promise<VaultBatch> {
  const [next, ...rest] = pending;
  if (next === undefined) return taken;
  let files: readonly VaultFile[];
  try {
    files = await filesOfItem(reader, next.subjectId);
  } catch (error) {
    if (!(error instanceof VaultItemFailure)) throw error;
    await parkVaultNote(reader.ports.db, next, error);
    return take(reader, rest, taken, bytes);
  }
  const binary = files.some(({ kind }) => kind === "binary");
  const size = textBytes(files);
  if (
    taken.pending.length > 0 &&
    (binary || bytes + size > 8 * 1024 * 1024 || taken.files.length + files.length > 500)
  )
    return taken;
  const batch = { pending: [...taken.pending, next], files: [...taken.files, ...files] };
  return binary ? batch : take(reader, rest, batch, bytes + size);
}

export function vaultFiles(
  input: Readonly<Reader & { pending: readonly PendingVaultNote[] }>,
): Promise<VaultBatch> {
  return take(input, input.pending, { pending: [], files: [] }, 0);
}
