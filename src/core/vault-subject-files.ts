import { readItem } from "./item-detail.ts";
import { itemFilePlan } from "./item-files.ts";
import { itemNote } from "./item-note.ts";
import type { JobPorts } from "./job-outcome.ts";
import { GITHUB_FILE_BYTES } from "./vault-contract.ts";
import { itemWikiSections } from "./vault-markdown.ts";
import { VaultNoteFailure } from "./vault-note-failure.ts";
import { vaultFilePath, vaultNotePath } from "./vault-paths.ts";
import type { VaultSubject } from "./vault-tables.ts";
import { type VaultFile, type VaultTarget, vaultFileSize } from "./vault-target.ts";
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

async function itemFiles(reader: Reader, subjectId: number): Promise<SubjectFiles> {
  reader.signal.throwIfAborted();
  const read = await readItem(reader.ports, subjectId);
  reader.signal.throwIfAborted();
  if (read === undefined) return { files: [], oversized: [] };
  const planned = itemFilePlan(read);
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
