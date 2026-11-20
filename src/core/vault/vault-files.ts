import { and, eq } from "drizzle-orm";

import { VAULT_FILE_BYTES } from "../contract/vault-contract.ts";
import { VaultNoteFailure } from "../contract/vault-note-failure.ts";
import { type PendingVaultNote, parkVaultNote } from "../kernel/vault-queue.ts";
import { mirrorFiles, type VaultSubject } from "../kernel/vault-tables.ts";
import {
  type VaultFile,
  type VaultChange,
  type VaultProgress,
  gitBlobSha,
  vaultFileSize,
} from "../kernel/vault-target.ts";
import { vaultContent } from "./vault-content.ts";
import { vaultNotePath } from "./vault-paths.ts";
import { type Reader, subjectFiles } from "./vault-subject-files.ts";

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
  readonly logMonthsChanged: boolean;
}

const EMPTY: Prepared = { changes: [], progress: [], bytes: 0, complete: true };

function groupsOf(
  files: readonly VaultFile[],
  previous: readonly Readonly<{ path: string }>[],
  subject: VaultSubject,
) {
  const paths = new Set(files.map(({ path }) => path));
  const notePath = vaultNotePath(subject);
  const isNote = ({ path }: Readonly<{ path: string }>) => path === notePath;
  const deletes = previous.flatMap(({ path }) =>
    paths.has(path) ? [] : [{ path, kind: "delete" as const }],
  );

  const removals =
    files.length === 0
      ? [deletes.filter((file) => isNote(file)), deletes.filter((file) => !isNote(file))]
      : [deletes];

  return [files.filter((file) => !isNote(file)), files.filter((file) => isNote(file)), ...removals];
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
  const sha = await gitBlobSha(bytes);
  return {
    progress: { ...progress, sha },
    change: sha === held ? null : { ...progress, kind: "put" as const, sha, bytes },
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
  const size = vaultFileSize(file);
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
): Promise<Prepared & Pick<VaultBatch, "oversized" | "logMonthsChanged">> {
  const { files, oversized } = await subjectFiles(reader, note);
  const previous = await reader.target.files(note);
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
  const logMonthsChanged =
    note.kind === "log-month" &&
    prepared.complete &&
    (files.length === 0 || previous.length === 0 || saved.length === 0);
  return { ...prepared, oversized, logMonthsChanged };
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
    logMonthsChanged: taken.logMonthsChanged || prepared.logMonthsChanged,
  };
  return prepared.complete ? take(reader, rest, next, bytes + prepared.bytes) : next;
}

export function vaultFiles(
  input: Readonly<Reader & { pending: readonly PendingVaultNote[] }>,
): Promise<VaultBatch> {
  return take(
    input,
    input.pending,
    { pending: [], complete: [], files: [], progress: [], oversized: [], logMonthsChanged: false },
    0,
  );
}
