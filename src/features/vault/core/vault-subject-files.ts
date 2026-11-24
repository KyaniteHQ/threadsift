import { GITHUB_FILE_BYTES } from "../../../core/contract/vault-contract.ts";
import { VaultNoteFailure } from "../../../core/contract/vault-note-failure.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { VaultSubject } from "../../../core/kernel/vault-tables.ts";
import {
  type VaultFile,
  type VaultTarget,
  vaultFileSize,
} from "../../../core/kernel/vault-target.ts";
import { itemFilePlan } from "../../item/core/item-files.ts";
import { itemNote } from "../../item/core/item-note.ts";
import { readPlanSource } from "../../item/core/plan-source.ts";
import { itemWikiSections } from "./vault-markdown.ts";
import { vaultFilePath, vaultNotePath } from "./vault-paths.ts";
import { vaultWikiContent } from "./vault-wiki.ts";

const TEXT = new TextEncoder();

export interface Reader {
  readonly ports: JobPorts;
  readonly target: VaultTarget;
  readonly signal: AbortSignal;
}

interface SubjectFiles {
  readonly files: readonly VaultFile[];
  readonly oversized: readonly string[];
}

function withoutOversized(files: readonly VaultFile[]) {
  const oversized = files.filter((file) => vaultFileSize(file) > GITHUB_FILE_BYTES);
  const omitted = new Set(oversized);

  return { kept: files.filter((file) => !omitted.has(file)), oversized };
}

async function readPlannedSource(reader: Reader, subjectId: number) {
  const first = await readPlanSource(reader.ports, subjectId);

  if (first === undefined) return null;

  const planned = itemFilePlan(first);

  if (planned.kind !== "missing") return { read: first, planned };

  reader.signal.throwIfAborted();

  const second = await readPlanSource(reader.ports, subjectId);

  return second === undefined ? null : { read: second, planned: itemFilePlan(second) };
}

async function itemFiles(reader: Reader, subjectId: number): Promise<SubjectFiles> {
  reader.signal.throwIfAborted();
  const source = await readPlannedSource(reader, subjectId);
  reader.signal.throwIfAborted();
  if (source === null) return { files: [], oversized: [] };
  const { read, planned } = source;
  if (planned.kind === "missing") throw new VaultNoteFailure("file-missing");
  const { postText, stored, note } = planned.plan;
  const assets = withoutOversized([
    ...(postText === null
      ? []
      : [
          {
            path: vaultFilePath(postText.key),
            kind: "memory" as const,
            bytes: TEXT.encode(postText.text),
          },
        ]),
    ...stored.map(({ key, size }) => ({
      path: vaultFilePath(key),
      kind: "binary" as const,
      key,
      size,
    })),
  ]);
  const omittedImages = assets.oversized.flatMap((file) =>
    file.kind === "binary" ? [file.key] : [],
  );
  const text = itemNote(note, { links: itemWikiSections(read), omittedImages });
  const page = withoutOversized([
    {
      path: vaultNotePath({ kind: "item", subjectId }),
      kind: "memory",
      bytes: TEXT.encode(text),
    },
  ]);

  return {
    files: [...assets.kept, ...page.kept],
    oversized: [...assets.oversized, ...page.oversized].map(({ path }) => path),
  };
}

export async function subjectFiles(
  reader: Reader,
  { kind, subjectId }: VaultSubject,
): Promise<SubjectFiles> {
  if (kind === "item") return itemFiles(reader, subjectId);

  const content = await vaultWikiContent(
    reader.ports.db,
    { kind, subjectId },
    reader.signal,
    reader.target.logMonths,
  );
  const path = vaultNotePath({ kind, subjectId });

  return {
    files: content.kind === "memory" ? [{ ...content, path }] : [],
    oversized: [],
  };
}
