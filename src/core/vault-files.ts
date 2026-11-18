import { and, eq } from "drizzle-orm";

import { planOf } from "./export-plan.ts";
import { readItem } from "./item-detail.ts";
import type { JobPorts } from "./job-outcome.ts";
import { base64VaultBytes, vaultContent, vaultContentSha } from "./vault-content.ts";
import { GITHUB_FILE_BYTES, VAULT_FILE_BYTES } from "./vault-contract.ts";
import type { VaultChange, VaultFile, VaultProgress, vaultGithub } from "./vault-github.ts";
import { itemWikiSections } from "./vault-markdown.ts";
import { VAULT_ROOT, vaultNotePath } from "./vault-paths.ts";
import { type PendingVaultNote, VaultNoteFailure, parkVaultNote } from "./vault-queue.ts";
import { mirrorFiles, type VaultSubject } from "./vault-tables.ts";
import { vaultWikiContent } from "./vault-wiki.ts";

interface Reader {
  readonly ports: JobPorts;
  readonly github: Readonly<ReturnType<typeof vaultGithub>>;
  readonly signal: AbortSignal;
}

interface Prepared {
  readonly changes: readonly VaultChange[];
  readonly progress: readonly VaultProgress[];
  readonly bytes: number;
  readonly complete: boolean;
}

export interface VaultBatch {
  readonly pending: readonly PendingVaultNote[];
  readonly complete: readonly PendingVaultNote[];
  readonly files: readonly VaultChange[];
  readonly progress: readonly VaultProgress[];
  readonly oversized: readonly string[];
}

const EMPTY: Prepared = { changes: [], progress: [], bytes: 0, complete: true };

async function itemFiles(reader: Reader, subjectId: number): Promise<readonly VaultFile[]> {
  reader.signal.throwIfAborted();
  const read = await readItem(reader.ports, subjectId);
  reader.signal.throwIfAborted();
  if (read === undefined) return [];
  const planned = planOf(
    {
      item: read.item,
      keptNodes: read.keptNodes(),
      postTextKey: read.postTextKey,
      storedFiles: read.storedFiles,
    },
    itemWikiSections(read),
  );
  if (planned.kind === "missing") throw new VaultNoteFailure("file-missing");
  const [note, ...text] = planned.plan.head;
  if (note === undefined) throw new VaultNoteFailure("item-unreadable");
  return [
    ...text.map(({ name, bytes }) => ({
      path: `${VAULT_ROOT}/${name}`,
      kind: "memory" as const,
      bytes,
    })),
    ...planned.plan.stored.map(({ key, size }) => ({
      path: `${VAULT_ROOT}/${key}`,
      kind: "binary" as const,
      key,
      size,
    })),
    {
      path: vaultNotePath({ kind: "item", subjectId }),
      kind: "memory",
      bytes: note.bytes,
    },
  ];
}

async function subjectFiles(reader: Reader, { kind, subjectId }: VaultSubject) {
  if (kind === "item") {
    const files = await itemFiles(reader, subjectId);
    const oversized = files.filter((file) => fileSize(file) > GITHUB_FILE_BYTES);
    const omitted = new Set(oversized);

    return {
      files: files.filter((file) => !omitted.has(file)),
      oversized: oversized.map(({ path }) => path),
    };
  }

  const content = await vaultWikiContent(reader.ports.db, { kind, subjectId }, reader.signal);
  const path = vaultNotePath({ kind, subjectId });

  return {
    files: content.kind === "memory" ? [{ ...content, path }] : [],
    oversized: content.kind === "oversized" ? [path] : [],
  };
}

function groupsOf(
  files: readonly VaultFile[],
  previous: readonly Readonly<{ path: string }>[],
  subject: VaultSubject,
) {
  const paths = new Set(files.map(({ path }) => path));
  const notePath = vaultNotePath(subject);
  const deletes = previous.flatMap(({ path }) =>
    paths.has(path) ? [] : [{ path, kind: "delete" as const }],
  );
  if (files.length === 0)
    return [
      deletes.filter(({ path }) => path === notePath),
      deletes.filter(({ path }) => path !== notePath),
    ];
  return [
    files.filter(({ path }) => path !== notePath),
    files.filter(({ path }) => path === notePath),
    deletes,
  ];
}

interface FileReader extends Reader {
  readonly note: PendingVaultNote;
  readonly remote: Readonly<ReadonlyMap<string, string>>;
  readonly saved: readonly Readonly<typeof mirrorFiles.$inferSelect>[];
}

function alreadyWritten(reader: FileReader, file: VaultFile): boolean {
  return reader.saved.some(
    (saved) =>
      saved.path === file.path &&
      saved.sequence === reader.note.sequence &&
      saved.sha === (reader.remote.get(file.path) ?? null),
  );
}

function fileSize(file: VaultFile): number {
  return file.kind === "delete" ? 0 : file.kind === "binary" ? file.size : file.bytes.length;
}

async function prepareFile(reader: FileReader, file: VaultFile) {
  const held = reader.remote.get(file.path) ?? null;
  const progress = {
    path: file.path,
    subjectId: reader.note.subjectId,
    noteKind: reader.note.kind,
    sequence: reader.note.sequence,
  };
  if (file.kind === "delete")
    return {
      progress: { ...progress, sha: null },
      change: held === null ? null : { ...progress, kind: "delete" as const, sha: null },
    };
  const bytes = await vaultContent({ ports: reader.ports, file, signal: reader.signal });
  const sha = await vaultContentSha(bytes);
  return {
    progress: { ...progress, sha },
    change:
      sha === held
        ? null
        : { ...progress, kind: "put" as const, sha, contents: base64VaultBytes(bytes) },
  };
}

async function prepareGroup(
  reader: FileReader,
  files: readonly VaultFile[],
  budget: number,
  taken: Prepared = EMPTY,
): Promise<Prepared> {
  const [file, ...rest] = files;
  if (file === undefined) return taken;
  if (alreadyWritten(reader, file)) return prepareGroup(reader, rest, budget, taken);
  const size = fileSize(file);
  if (size > VAULT_FILE_BYTES) throw new VaultNoteFailure("file-too-large");
  if (taken.bytes + size > budget) return { ...taken, complete: false };
  const result = await prepareFile(reader, file);
  const next = {
    changes: result.change === null ? taken.changes : [...taken.changes, result.change],
    progress: [...taken.progress, result.progress],
    bytes: taken.bytes + (result.change === null ? 0 : size),
    complete: true,
  };
  return prepareGroup(reader, rest, budget, next);
}

async function prepareSubject(
  reader: Reader,
  note: PendingVaultNote,
  budget: number,
): Promise<Prepared & { oversized: readonly string[] }> {
  const { files, oversized } = await subjectFiles(reader, note);
  const previous = await reader.github.files(note);
  const saved = await reader.ports.db
    .select()
    .from(mirrorFiles)
    .where(and(eq(mirrorFiles.kind, note.kind), eq(mirrorFiles.subjectId, note.subjectId)));
  const input = {
    ...reader,
    note,
    remote: new Map(previous.map((file) => [file.path, file.sha])),
    saved,
  };
  const prepared = await prepareGroups(input, groupsOf(files, previous, note), budget, []);
  return { ...prepared, oversized };
}

async function prepareGroups(
  reader: FileReader,
  groups: readonly (readonly VaultFile[])[],
  budget: number,
  progress: readonly VaultProgress[],
): Promise<Prepared> {
  const [group, ...rest] = groups;
  if (group === undefined) return { ...EMPTY, progress };
  const prepared = await prepareGroup(reader, group, budget);
  const observed = [...progress, ...prepared.progress];
  if (!prepared.complete || prepared.changes.length > 0)
    return {
      ...prepared,
      progress: observed,
      complete: prepared.complete && rest.every((later) => later.length === 0),
    };
  return prepareGroups(reader, rest, budget, observed);
}

async function take(
  reader: Reader,
  pending: readonly PendingVaultNote[],
  taken: VaultBatch,
  bytes: number,
): Promise<VaultBatch> {
  const [note, ...rest] = pending;
  if (note === undefined) return taken;
  let prepared: Awaited<ReturnType<typeof prepareSubject>>;
  try {
    prepared = await prepareSubject(reader, note, VAULT_FILE_BYTES - bytes);
  } catch (error) {
    if (!(error instanceof VaultNoteFailure)) throw error;
    await parkVaultNote(reader.ports.db, note, error);
    return take(reader, rest, taken, bytes);
  }
  const next = {
    pending: [...taken.pending, note],
    complete: prepared.complete ? [...taken.complete, note] : taken.complete,
    files: [...taken.files, ...prepared.changes],
    progress: [...taken.progress, ...prepared.progress],
    oversized: [...taken.oversized, ...prepared.oversized],
  };
  return prepared.complete ? take(reader, rest, next, bytes + prepared.bytes) : next;
}

export function vaultFiles(
  input: Readonly<Reader & { pending: readonly PendingVaultNote[] }>,
): Promise<VaultBatch> {
  return take(
    input,
    input.pending,
    { pending: [], complete: [], files: [], progress: [], oversized: [] },
    0,
  );
}
