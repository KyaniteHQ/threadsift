import { eq } from "drizzle-orm";

import { planOf } from "./export-plan.ts";
import { readItem } from "./item-detail.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { VaultFile } from "./vault-github.ts";
import { mirrorFiles, mirrorPaths } from "./vault-tables.ts";

type Pending = typeof mirrorPaths.$inferSelect;

function encoded(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 32_768) {
    text += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  }
  return btoa(text);
}

async function storedFiles(
  ports: JobPorts,
  itemId: number,
  files: readonly Readonly<{ key: string; size: number }>[],
): Promise<readonly VaultFile[]> {
  const [next, ...rest] = files;
  if (next === undefined) return [];
  const stream = await ports.files.get(next.key);
  if (stream === null) throw new Error("Vault attachment is missing");
  const bytes = new Uint8Array(next.size);
  let offset = 0;
  for await (const chunk of stream) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== next.size) throw new Error("Vault attachment size changed");
  return [
    { itemId, path: `Threadsift/${next.key}`, kind: "binary", content: encoded(bytes) },
    ...(await storedFiles(ports, itemId, rest)),
  ];
}

async function itemFiles(ports: JobPorts, itemId: number): Promise<readonly VaultFile[]> {
  const read = await readItem(ports, itemId);
  if (read === undefined) return [];
  const planned = planOf({
    item: read.item,
    keptNodes: read.keptNodes(),
    postTextKey: read.postTextKey,
    storedFiles: read.storedFiles,
  });
  if (planned.kind === "missing") throw new Error("Vault Item file is missing");
  const [note, ...text] = planned.plan.head;
  if (note === undefined) throw new Error("Vault Item note is missing");
  return [
    {
      itemId,
      path: `Threadsift/items/${String(itemId)}/note-${String(itemId)}.md`,
      kind: "text",
      content: new TextDecoder().decode(note.bytes),
    },
    ...text.map(({ name, bytes }) => ({
      itemId,
      path: `Threadsift/${name}`,
      kind: "text" as const,
      content: new TextDecoder().decode(bytes),
    })),
    ...(await storedFiles(ports, itemId, planned.plan.stored)),
  ];
}

async function filesOfItem(ports: JobPorts, itemId: number): Promise<readonly VaultFile[]> {
  const files = await itemFiles(ports, itemId);
  const paths = new Set(files.map(({ path }) => path));
  const previous = await ports.db.select().from(mirrorFiles).where(eq(mirrorFiles.itemId, itemId));
  const removed = previous
    .filter(({ path }) => !paths.has(path))
    .map(({ path }) => ({ itemId, path, kind: "delete" as const, content: null }));
  return [...files, ...removed];
}

interface VaultBatch {
  readonly pending: readonly Pending[];
  readonly files: readonly VaultFile[];
}

const EMPTY_BATCH: VaultBatch = { pending: [], files: [] };

export async function vaultFiles(
  ports: JobPorts,
  pending: readonly Pending[],
  taken: VaultBatch = EMPTY_BATCH,
  bytes = 0,
): Promise<VaultBatch> {
  const [next, ...rest] = pending;
  if (next === undefined) return taken;
  const files = await filesOfItem(ports, next.itemId);
  const binary = files.some(({ kind }) => kind === "binary");
  const size = files.reduce(
    (sum, file) => sum + new TextEncoder().encode(file.content ?? "").length,
    0,
  );
  if (
    taken.pending.length > 0 &&
    (binary || bytes + size > 8 * 1024 * 1024 || taken.files.length + files.length > 500)
  )
    return taken;
  const batch = { pending: [...taken.pending, next], files: [...taken.files, ...files] };
  return binary ? batch : vaultFiles(ports, rest, batch, bytes + size);
}
