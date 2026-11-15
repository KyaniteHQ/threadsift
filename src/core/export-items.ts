import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";

import { EXPORT_SLICE_BYTES } from "./export-contract.ts";
import { parseFileKey } from "./file-keys.ts";
import { readItem } from "./item-detail.ts";
import { itemNote, noteFileName } from "./item-note.ts";
import type { Database, FileStore, Ports } from "./ports.ts";
import { items, media } from "./schema.ts";
import { type ZipFile, joined } from "./zip.ts";

export class ExportFileMissing extends Error {}

const TEXT = new TextEncoder();

type ItemPorts = Pick<Ports, "db" | "files">;

type ImagesRead =
  | { readonly kind: "missing"; readonly key: string }
  | { readonly kind: "ready"; readonly files: readonly ZipFile[] };

type Gathered = ImagesRead | { readonly kind: "gone" };

async function bytesOf(files: Pick<FileStore, "get">, key: string): Promise<Uint8Array | null> {
  const body = await files.get(key);

  if (body === null) return null;

  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return joined(chunks);
}

async function storedFileKeys(db: Database, itemId: number): Promise<readonly string[]> {
  const rows = await db
    .select({ key: media.fileKey })
    .from(media)
    .where(and(eq(media.itemId, itemId), eq(media.outcome, "stored"), isNotNull(media.fileKey)))
    .orderBy(asc(media.position));

  return rows.flatMap(({ key }) => (key === null ? [] : [key]));
}

function ownedBy(itemId: number, key: string): boolean {
  return parseFileKey(key)?.itemId === String(itemId);
}

async function readImages(
  files: Pick<FileStore, "get">,
  itemId: number,
  keys: readonly string[],
): Promise<ImagesRead> {
  const read = await Promise.all(
    keys.map(async (key) => ({
      key,
      bytes: ownedBy(itemId, key) ? await bytesOf(files, key) : null,
    })),
  );

  const lost = read.find(({ bytes }) => bytes === null);

  if (lost !== undefined) return { kind: "missing", key: lost.key };

  return {
    kind: "ready",
    files: read.flatMap(({ key, bytes }) => (bytes === null ? [] : [{ name: key, bytes }])),
  };
}

type ReaderItem = NonNullable<Awaited<ReturnType<typeof readItem>>>["item"];

type NotedItem = Readonly<
  Pick<
    ReaderItem,
    | "id"
    | "source"
    | "kind"
    | "originalUrl"
    | "author"
    | "community"
    | "postedAt"
    | "savedAt"
    | "fetchedAt"
    | "digestTopic"
    | "readState"
    | "digestTitle"
    | "title"
    | "digest"
    | "highlights"
    | "note"
    | "postText"
    | "comments"
  >
>;

function noteOf(item: NotedItem): string {
  const filter = item.comments.view?.filter;

  return itemNote({
    id: item.id,
    source: item.source,
    kind: item.kind,
    url: item.originalUrl,
    author: item.author,
    community: item.community,
    postedAt: item.postedAt,
    savedAt: item.savedAt,
    fetchedAt: item.fetchedAt,
    topic: item.digestTopic,
    tags: item.digest?.tags ?? [],
    readState: item.readState,
    title: item.digestTitle ?? item.title,
    summary: item.digest?.summary ?? null,
    keyPoints: item.digest?.keyPoints ?? [],
    highlights: item.highlights.items.map(({ selector, status }) => ({
      exact: selector.exact,
      found: status === "attached",
    })),
    note: item.note.body,
    postText: item.postText,
    comments: filter === "kept" || filter === "nothing-kept" ? item.comments.nodes : [],
  });
}

async function gather(ports: Readonly<ItemPorts>, itemId: number): Promise<Gathered> {
  const read = await readItem(ports, itemId);

  if (read === undefined) return { kind: "gone" };

  const { item, postTextKey } = read;

  if (postTextKey !== null && (item.postText === null || !ownedBy(itemId, postTextKey))) {
    return { kind: "missing", key: postTextKey };
  }

  const images = await readImages(ports.files, itemId, await storedFileKeys(ports.db, itemId));

  if (images.kind === "missing") return images;

  return {
    kind: "ready",
    files: [
      {
        name: `items/${String(itemId)}/${noteFileName(item.digestTitle ?? item.title)}`,
        bytes: TEXT.encode(noteOf(item)),
      },
      ...(postTextKey === null || item.postText === null
        ? []
        : [{ name: postTextKey, bytes: TEXT.encode(item.postText) }]),
      ...images.files,
    ],
  };
}

export async function itemEntries(
  ports: Readonly<ItemPorts>,
  itemId: number,
): Promise<readonly ZipFile[] | null> {
  const first = await gather(ports, itemId);
  const settled = first.kind === "missing" ? await gather(ports, itemId) : first;

  if (settled.kind === "missing") {
    throw new ExportFileMissing(`The file ${settled.key} is missing for Item ${String(itemId)}`);
  }

  return settled.kind === "gone" ? null : settled.files;
}

export interface TakenItems {
  readonly files: readonly ZipFile[];
  readonly count: number;
  readonly last: number;
  readonly done: boolean;
  readonly full: boolean;
}

interface Listed {
  readonly id: number;
  readonly imageBytes: number;
}

interface Taking extends TakenItems {
  readonly bytes: number;
}

async function takeEach(
  ports: Readonly<ItemPorts>,
  root: string,
  pending: readonly Listed[],
  taking: Readonly<Taking>,
): Promise<Taking> {
  const [next, ...rest] = pending;

  if (next === undefined) return taking;

  if (taking.bytes > 0 && taking.bytes + next.imageBytes > EXPORT_SLICE_BYTES) {
    return { ...taking, full: true };
  }

  const entries = (await itemEntries(ports, next.id)) ?? [];

  return takeEach(ports, root, rest, {
    files: [
      ...taking.files,
      ...entries.map(({ name, bytes }) => ({ name: `${root}/${name}`, bytes })),
    ],
    count: taking.count + 1,
    last: next.id,
    done: false,
    full: false,
    bytes: entries.reduce((sum, { bytes }) => sum + bytes.length, taking.bytes),
  });
}

export async function takeItems(
  ports: Readonly<ItemPorts>,
  {
    root,
    after,
    limit,
    used,
  }: Readonly<{ root: string; after: number; limit: number; used: number }>,
): Promise<TakenItems> {
  const listed = await ports.db
    .select({
      id: items.id,
      imageBytes: sql<number>`coalesce((select sum(${media.size}) from ${media} where ${media.itemId} = ${items.id} and ${media.outcome} = 'stored'), 0)`,
    })
    .from(items)
    .where(gt(items.id, after))
    .orderBy(asc(items.id))
    .limit(limit);

  const { bytes: _bytes, ...taken } = await takeEach(ports, root, listed, {
    files: [],
    count: 0,
    last: after,
    done: false,
    full: false,
    bytes: used,
  });

  return { ...taken, done: !taken.full && listed.length < limit };
}
