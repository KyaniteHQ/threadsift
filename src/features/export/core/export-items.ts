import { asc, gt } from "drizzle-orm";

import { EXPORT_SLICE_BYTES, type PartialItem } from "../../../core/contract/export-contract.ts";
import { itemFileKey } from "../../../core/contract/file-keys.ts";
import { readExactly } from "../../../core/kernel/capped.ts";
import type { FileStore } from "../../../core/kernel/file-store.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { items } from "../../../core/kernel/schema.ts";
import type { ItemFilePlan, StoredFile } from "../../item/core/item-files.ts";
import { itemNote, noteFileName } from "../../item/core/item-note.ts";
import { readAgainOnce, readPlannedItem } from "../../item/core/plan-source.ts";
import type { ZipFile } from "./zip.ts";

const TEXT = new TextEncoder();

class ExportFileMissing extends Error {}

function missingFile(key: string, itemId: number): ExportFileMissing {
  return new ExportFileMissing(`The file ${key} is missing for Item ${String(itemId)}`);
}

type ItemPorts = Pick<Ports, "db" | "files">;

interface Place {
  readonly resume: PartialItem | null;
  readonly used: number;
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

  const body = await files.get(next.key);
  const bytes = body === null ? null : await readExactly(body, next.size);

  return bytes === null
    ? { kind: "missing", key: next.key }
    : readEach(files, rest, [...read, { name: next.key, bytes }]);
}

interface Chosen {
  readonly head: readonly ZipFile[];
  readonly stored: readonly StoredFile[];
  readonly written: readonly string[] | null;
}

function headOf({ note, postText }: Readonly<ItemFilePlan>): readonly ZipFile[] {
  return [
    {
      name: itemFileKey(note.id, noteFileName(note.title)),
      bytes: TEXT.encode(itemNote(note, { links: [], omittedImages: [] })),
    },
    ...(postText === null ? [] : [{ name: postText.key, bytes: TEXT.encode(postText.text) }]),
  ];
}

function fitting(sizes: readonly number[], used: number): number {
  let total = used;

  const refused = sizes.findIndex((size) => {
    if (total !== 0 && total + size > EXPORT_SLICE_BYTES) return true;

    total += size;

    return false;
  });

  return refused === -1 ? sizes.length : refused;
}

function writtenBefore(names: readonly string[], resume: PartialItem | null): readonly string[] {
  if (resume === null) return [];

  return "written" in resume ? resume.written : names.slice(0, resume.entries);
}

function choose(plan: Readonly<ItemFilePlan>, { resume, used }: Readonly<Place>): Chosen {
  const head = headOf(plan);
  const before = writtenBefore(
    [...head.map(({ name }) => name), ...plan.stored.map(({ key }) => key)],
    resume,
  );
  const pendingHead = head.filter(({ name }) => !before.includes(name));
  const pendingStored = plan.stored.filter(({ key }) => !before.includes(key));
  const sizes = [
    ...pendingHead.map(({ bytes }) => bytes.length),
    ...pendingStored.map(({ size }) => size),
  ];
  const at = fitting(sizes, used);
  const chosenHead = pendingHead.slice(0, at);
  const chosenStored = pendingStored.slice(0, Math.max(0, at - pendingHead.length));

  return {
    head: chosenHead,
    stored: chosenStored,
    written:
      at < sizes.length
        ? [...before, ...chosenHead.map(({ name }) => name), ...chosenStored.map(({ key }) => key)]
        : null,
  };
}

type Gathered =
  | { readonly kind: "gone" }
  | { readonly kind: "missing"; readonly key: string }
  | {
      readonly kind: "ready";
      readonly files: readonly ZipFile[];
      readonly written: readonly string[] | null;
    };

async function gather(
  ports: Readonly<ItemPorts>,
  itemId: number,
  place: Readonly<Place>,
): Promise<Gathered> {
  const read = await readPlannedItem(ports, itemId);

  if (read === null) return { kind: "gone" };

  if (read.planned.kind === "missing") return read.planned;

  const chosen = choose(read.planned.plan, place);
  const images = await readEach(ports.files, chosen.stored, []);

  return images.kind === "missing"
    ? images
    : { kind: "ready", files: [...chosen.head, ...images.files], written: chosen.written };
}

async function itemEntries(
  ports: Readonly<ItemPorts>,
  itemId: number,
  place: Readonly<Place>,
): Promise<Exclude<Gathered, { kind: "missing" }>> {
  const settled = await readAgainOnce(
    () => gather(ports, itemId, place),
    ({ kind }) => kind === "missing",
  );

  if (settled.kind === "missing") throw missingFile(settled.key, itemId);

  return settled;
}

interface TakenItems {
  readonly files: readonly ZipFile[];
  readonly count: number;
  readonly last: number;
  readonly partial: PartialItem | null;
  readonly done: boolean;
  readonly full: boolean;
  readonly usedBytes: number;
}

interface Taker {
  readonly root: string;
  readonly resume: PartialItem | null;
}

async function takeEach(
  ports: Readonly<ItemPorts>,
  taker: Readonly<Taker>,
  pending: readonly number[],
  taking: Readonly<TakenItems>,
): Promise<TakenItems> {
  const [id, ...rest] = pending;

  if (id === undefined) return taking;

  const resume = taker.resume?.id === id ? taker.resume : null;
  const gathered = await itemEntries(ports, id, { resume, used: taking.usedBytes });

  if (gathered.kind === "gone") {
    return takeEach(ports, taker, rest, { ...taking, count: taking.count + 1, last: id });
  }

  const counted = {
    ...taking,
    files: [
      ...taking.files,
      ...gathered.files.map(({ name, bytes }) => ({ name: `${taker.root}/${name}`, bytes })),
    ],
    usedBytes: gathered.files.reduce((sum, { bytes }) => sum + bytes.length, taking.usedBytes),
    count: taking.count + 1,
  };

  if (gathered.written !== null) {
    return {
      ...counted,
      partial: gathered.written.length > 0 ? { id, written: gathered.written } : null,
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

  const taken = await takeEach(
    ports,
    { root, resume },
    listed.map(({ id }) => id),
    { files: [], count: 0, last: after, partial: null, done: false, full: false, usedBytes: used },
  );

  return { ...taken, done: !taken.full && listed.length < limit };
}
