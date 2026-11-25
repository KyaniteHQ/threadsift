import assert from "node:assert/strict";

import { BatchResponseSchema } from "../src/core/contract/batch-wire.ts";
import { ExportStatusSchema, StartedExportSchema } from "../src/core/contract/export-contract.ts";
import { INLINE_TEXT_BYTES } from "../src/core/contract/limits.ts";
import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { placePostText } from "../src/features/thread/core/post-text-files.ts";
import { bytesOfKey, exportKeys, itemTextAt, postTextKey } from "./file-store-fixtures.ts";
import type { Instance } from "./instance.ts";
import { pasteInOrder, until, inOrder } from "./library-fixtures.ts";
import { keepPassage, textHolding } from "./lost-highlight-fixtures.ts";
import { directoryOf } from "./zip-fixtures.ts";

export const MARKED_PASSAGE = "quartz seam";

const LONG_LINE = "A long line of post text that fills the file stored beside the Item.\n\n";

export const NOTE_BODY = "A note to bring back";

interface LibraryCounts {
  readonly inlineText: number;
  readonly linkOnly?: number;
  readonly fileText: number;
}

export const EXPORT_LIBRARY = {
  inlineText: 3,
  linkOnly: 42,
  fileText: 5,
} as const satisfies LibraryCounts;

export interface SavedLibrary {
  readonly ids: readonly number[];
  readonly textedIds: readonly number[];
  readonly longTexts: ReadonlyMap<number, string>;
  readonly highlightedId: number;
}

const xLink = (at: number): string => `https://x.com/someone/status/${String(3_700_000_000 + at)}`;

function longPostText(slug: string): string {
  const lines = Math.ceil((INLINE_TEXT_BYTES + 100_000) / LONG_LINE.length);

  return `${textHolding(MARKED_PASSAGE)}\n\n${slug}\n\n${LONG_LINE.repeat(lines)}`;
}

export function firstLongText(library: SavedLibrary) {
  const [first] = library.longTexts;

  assert.ok(first !== undefined, "the library holds an Item with a post text file");

  const [id, text] = first;

  return { id, text };
}

async function movedToFile(instance: Instance, id: number, text: string): Promise<void> {
  const { columns } = await placePostText(
    instance.core,
    { itemId: id, attemptKey: postTextKey(id) },
    text,
  );

  const key = columns?.postTextKey;

  assert.ok(key !== null && key !== undefined, "the text is placed in a file");
  itemTextAt(instance, id, key);
}

const pastedTexts = (instance: Instance, count: number, first: number) =>
  pasteInOrder(
    instance,
    Array.from({ length: count }, (_, offset) => {
      const at = first + offset;
      const slug = `item-${String(at)}`;

      return [
        slug,
        {
          title: `Title of ${slug}`,
          topic: at % 2 === 0 ? "Databases" : "Networks",
          tags: [at % 3 === 0 ? "alpha" : "beta"],
          postText: textHolding(MARKED_PASSAGE),
        },
      ] as const;
    }),
  );

async function linkedItems(instance: Instance, count: number): Promise<readonly number[]> {
  if (count === 0) return [];

  const links = Array.from({ length: count }, (_, at) => ({ url: xLink(at) }));
  const answer = await instance.send("POST", "/api/items/batch", { links });

  assert.equal(answer.status, 200, answer.body);

  return BatchResponseSchema.parse(JSON.parse(answer.body)).results.map((result) => {
    assert.ok("item" in result, "a link of the batch is saved");

    return result.item.id;
  });
}

export async function savedLibrary(
  instance: Instance,
  { inlineText, linkOnly = 0, fileText }: LibraryCounts,
): Promise<SavedLibrary> {
  const inline = await pastedTexts(instance, inlineText, 0);
  const links = await linkedItems(instance, linkOnly);
  const filed = await pastedTexts(instance, fileText, inlineText);
  const [highlightedId] = inline;

  assert.ok(highlightedId !== undefined, "the library holds an Item with an inline post text");
  await keepPassage(instance, highlightedId, MARKED_PASSAGE);

  const { note } = await instance.detail(highlightedId);

  await instance.read("PUT", `/api/items/${String(highlightedId)}/note`, NoteResponseSchema, {
    body: NOTE_BODY,
    revision: note.revision,
  });

  const longTexts = new Map(filed.map((id) => [id, longPostText(`item-${String(id)}`)] as const));

  await inOrder([...longTexts], ([id, text]) => movedToFile(instance, id, text));

  return {
    ids: [...inline, ...links, ...filed],
    textedIds: [...inline, ...filed],
    longTexts,
    highlightedId,
  };
}

export async function readyExport(instance: Instance) {
  const started = await instance.read("POST", "/api/export", StartedExportSchema);

  const status = await until(
    "the Export has stopped running",
    () => instance.read("GET", "/api/export", ExportStatusSchema),
    ({ state }) => state !== "running",
  );

  assert.equal(status.state, "ready");

  return { id: started.id, status };
}

export async function downloadedZip(instance: Instance, id: number): Promise<Uint8Array> {
  const download = await instance.request(`/api/export/${String(id)}/download`);

  assert.equal(download.status, 200);

  return new Uint8Array(await download.arrayBuffer());
}

export async function exportedZip(instance: Instance): Promise<Uint8Array> {
  const { id } = await readyExport(instance);

  return downloadedZip(instance, id);
}

const PIECE_NAME = /\/(part|dir|tail)-(\d+)/u;

export async function exportPieces(instance: Instance, id: number) {
  const pieces = (await exportKeys(instance, id))
    .map((key) => {
      const [, stem = "", number = ""] = PIECE_NAME.exec(key) ?? [];

      return { key, stem, number: Number(number) };
    })
    .toSorted((left, right) => left.number - right.number);

  const keysOf = (stem: "part" | "dir" | "tail") =>
    pieces.filter((piece) => piece.stem === stem).map(({ key }) => key);

  return { parts: keysOf("part"), directories: keysOf("dir"), tails: keysOf("tail") };
}

export interface SliceEntry {
  readonly name: string;
  readonly size: number;
}

export async function sliceEntries(
  instance: Instance,
  id: number,
  zip: Uint8Array,
): Promise<readonly (readonly SliceEntry[])[]> {
  const { parts } = await exportPieces(instance, id);

  const lengths = await Promise.all(
    parts.map(async (key) => (await bytesOfKey(instance, key)).length),
  );
  const ends = lengths.map((_, at) =>
    lengths.slice(0, at + 1).reduce((sum, length) => sum + length, 0),
  );
  const { entries } = await directoryOf(zip);

  return ends.map((end, at) =>
    entries
      .filter(
        ({ headerOffset, name }) =>
          headerOffset >= (ends[at - 1] ?? 0) &&
          headerOffset < end &&
          !name.endsWith("/threadsift.json"),
      )
      .map(({ name, size }) => ({ name, size })),
  );
}
