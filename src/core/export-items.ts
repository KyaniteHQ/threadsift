import { asc, gt } from "drizzle-orm";

import { EXPORT_SLICE_BYTES, type PartialItem } from "./export-contract.ts";
import { type Plan, type StoredFile, planOf } from "./export-plan.ts";
import { readItem } from "./item-detail.ts";
import type { FileStore, Ports } from "./ports.ts";
import { items } from "./schema.ts";
import type { ZipFile } from "./zip.ts";

class ExportFileMissing extends Error {}

type ItemPorts = Pick<Ports, "db" | "files">;

interface Place {
  readonly skip: number;
  readonly used: number;
}

async function readSized(
  files: Pick<FileStore, "get">,
  { key, size }: Readonly<StoredFile>,
): Promise<Uint8Array | null> {
  const body = await files.get(key);

  if (body === null) return null;

  const bytes = new Uint8Array(size);
  let filled = 0;

  for await (const chunk of body) {
    if (filled + chunk.length > size) return null;

    bytes.set(chunk, filled);
    filled += chunk.length;
  }

  return filled === size ? bytes : null;
}

type Reading =
  | { readonly kind: "missing"; readonly key: string }
  | { readonly kind: "read"; readonly files: readonly ZipFile[] };

async function readEach(
  files: Pick<FileStore, "get">,
  pending: readonly StoredFile[],
  read: readonly ZipFile[],
): Promise<Reading> {
  const [next, ...rest] = pending;

  if (next === undefined) return { kind: "read", files: read };

  const bytes = await readSized(files, next);

  return bytes === null
    ? { kind: "missing", key: next.key }
    : readEach(files, rest, [...read, { name: next.key, bytes }]);
}

interface Chosen {
  readonly head: readonly ZipFile[];
  readonly stored: readonly StoredFile[];
  readonly next: number | null;
}

function choose(plan: Readonly<Plan>, { skip, used }: Readonly<Place>): Chosen {
  const sizes = [
    ...plan.head.map(({ bytes }) => bytes.length),
    ...plan.stored.map(({ size }) => size),
  ];

  let total = used;
  let at = skip;

  while (at < sizes.length && (total === 0 || total + (sizes[at] ?? 0) <= EXPORT_SLICE_BYTES)) {
    total += sizes[at] ?? 0;
    at += 1;
  }

  const headCount = plan.head.length;

  return {
    head: plan.head.slice(skip, at),
    stored: plan.stored.slice(Math.max(0, skip - headCount), Math.max(0, at - headCount)),
    next: at < sizes.length ? at : null,
  };
}

type Gathered =
  | { readonly kind: "gone" }
  | { readonly kind: "missing"; readonly key: string }
  | {
      readonly kind: "ready";
      readonly files: readonly ZipFile[];
      readonly next: number | null;
    };

async function gather(
  ports: Readonly<ItemPorts>,
  itemId: number,
  place: Readonly<Place>,
): Promise<Gathered> {
  const read = await readItem(ports, itemId);

  if (read === undefined) return { kind: "gone" };

  const planned = planOf({
    item: read.item,
    keptNodes: read.keptNodes(),
    postTextKey: read.postTextKey,
    storedFiles: read.storedFiles,
  });

  if (planned.kind === "missing") return planned;

  const chosen = choose(planned.plan, place);
  const images = await readEach(ports.files, chosen.stored, []);

  return images.kind === "missing"
    ? images
    : { kind: "ready", files: [...chosen.head, ...images.files], next: chosen.next };
}

async function itemEntries(
  ports: Readonly<ItemPorts>,
  itemId: number,
  place: Readonly<Place>,
): Promise<Exclude<Gathered, { kind: "missing" }>> {
  const first = await gather(ports, itemId, place);
  const settled = first.kind === "missing" ? await gather(ports, itemId, place) : first;

  if (settled.kind === "missing") {
    throw new ExportFileMissing(`The file ${settled.key} is missing for Item ${String(itemId)}`);
  }

  return settled;
}

export interface TakenItems {
  readonly files: readonly ZipFile[];
  readonly count: number;
  readonly last: number;
  readonly partial: PartialItem | null;
  readonly done: boolean;
  readonly full: boolean;
}

interface Taking extends TakenItems {
  readonly bytes: number;
}

interface Taker {
  readonly root: string;
  readonly resume: PartialItem | null;
}

async function takeEach(
  ports: Readonly<ItemPorts>,
  taker: Readonly<Taker>,
  pending: readonly number[],
  taking: Readonly<Taking>,
): Promise<Taking> {
  const [id, ...rest] = pending;

  if (id === undefined) return taking;

  const skip = taker.resume?.id === id ? taker.resume.entries : 0;
  const gathered = await itemEntries(ports, id, { skip, used: taking.bytes });

  if (gathered.kind === "gone") {
    return takeEach(ports, taker, rest, { ...taking, count: taking.count + 1, last: id });
  }

  const counted = {
    ...taking,
    files: [
      ...taking.files,
      ...gathered.files.map(({ name, bytes }) => ({ name: `${taker.root}/${name}`, bytes })),
    ],
    bytes: gathered.files.reduce((sum, { bytes }) => sum + bytes.length, taking.bytes),
    count: taking.count + 1,
  };

  if (gathered.next !== null) {
    return {
      ...counted,
      partial: gathered.next > 0 ? { id, entries: gathered.next } : null,
      full: true,
    };
  }

  return takeEach(ports, taker, rest, { ...counted, last: id });
}

export async function takeItems(
  ports: Readonly<ItemPorts>,
  {
    root,
    after,
    resume,
    limit,
    used,
  }: Readonly<{
    root: string;
    after: number;
    resume: PartialItem | null;
    limit: number;
    used: number;
  }>,
): Promise<TakenItems> {
  const listed = await ports.db
    .select({ id: items.id })
    .from(items)
    .where(gt(items.id, after))
    .orderBy(asc(items.id))
    .limit(limit);

  const { bytes: _bytes, ...taken } = await takeEach(
    ports,
    { root, resume },
    listed.map(({ id }) => id),
    { files: [], count: 0, last: after, partial: null, done: false, full: false, bytes: used },
  );

  return { ...taken, done: !taken.full && listed.length < limit };
}
