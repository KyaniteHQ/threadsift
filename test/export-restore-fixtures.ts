import assert from "node:assert/strict";

import { BatchResponseSchema } from "../src/core/contract/batch-wire.ts";
import { ExportStatusSchema, StartedExportSchema } from "../src/core/contract/export-contract.ts";
import { INLINE_TEXT_BYTES } from "../src/core/contract/limits.ts";
import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { inOrder } from "./grok-bot-fixtures.ts";
import type { Instance } from "./instance.ts";
import { keepPassage, textHolding } from "./lost-highlight-fixtures.ts";
import { paste, until } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";
import { directoryOf } from "./zip-fixtures.ts";

const MARKED_PASSAGE = "quartz seam";

const LONG_LINE = "A long line of post text that fills the file stored beside the Item.\n\n";

export const NOTE_BODY = "A note to bring back";

export const EXPORT_LIBRARY = { small: 3, linked: 42, long: 5 } as const;

export interface SavedLibrary {
  readonly ids: readonly number[];
  readonly textedIds: readonly number[];
  readonly longTextIds: readonly number[];
  readonly marked: number;
}

const xLink = (at: number): string => `https://x.com/someone/status/${String(3_700_000_000 + at)}`;

export function longPostText(slug: string): string {
  const lines = Math.ceil((INLINE_TEXT_BYTES + 100_000) / LONG_LINE.length);

  return `${textHolding(MARKED_PASSAGE)}\n\n${slug}\n\n${LONG_LINE.repeat(lines)}`;
}

export function postTextKey(id: number): string {
  return `items/${String(id)}/post-1-1.md`;
}

async function movedToFile(instance: Instance, id: number, text: string): Promise<void> {
  const key = postTextKey(id);

  await instance.core.files.put(key, new TextEncoder().encode(text));
  exec(instance, "update items set post_text = null, post_text_key = ? where id = ?", key, id);
}

async function pastedItems(instance: Instance, slugs: readonly string[], first: number) {
  const ids: number[] = [];

  await inOrder(slugs, async (slug) => {
    const at = first + ids.length;

    ids.push(
      await paste(instance, slug, {
        title: `Title of ${slug}`,
        topic: at % 2 === 0 ? "Databases" : "Networks",
        tags: [at % 3 === 0 ? "alpha" : "beta"],
        postText: textHolding(MARKED_PASSAGE),
      }),
    );
  });

  return ids;
}

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
  { small, linked = 0, long }: Readonly<{ small: number; linked?: number; long: number }>,
): Promise<SavedLibrary> {
  const first = await pastedItems(
    instance,
    Array.from({ length: small }, (_, at) => `item-${String(at)}`),
    0,
  );

  const links = await linkedItems(instance, linked);

  const longTextIds = await pastedItems(
    instance,
    Array.from({ length: long }, (_, at) => `item-${String(small + at)}`),
    small,
  );

  const [marked] = first;

  assert.ok(marked !== undefined, "the library holds an Item");
  await keepPassage(instance, marked, MARKED_PASSAGE);

  const { note } = await instance.detail(marked);

  await instance.read("PUT", `/api/items/${String(marked)}/note`, NoteResponseSchema, {
    body: NOTE_BODY,
    revision: note.revision,
  });

  await inOrder(longTextIds, (id) => movedToFile(instance, id, longPostText(`item-${String(id)}`)));

  return {
    ids: [...first, ...links, ...longTextIds],
    textedIds: [...first, ...longTextIds],
    longTextIds,
    marked,
  };
}

export async function readyExport(instance: Instance) {
  const started = await instance.read("POST", "/api/export", StartedExportSchema);

  const status = await until(
    () => instance.read("GET", "/api/export", ExportStatusSchema),
    ({ state }) => state !== "running",
  );

  assert.equal(status.state, "ready");

  return { id: started.id, status };
}

export async function downloadedZip(instance: Instance, id: number): Promise<Uint8Array> {
  const download = await instance.fetch(`/api/export/${String(id)}/download`, {
    headers: { cookie: instance.sessionCookie ?? "" },
  });

  assert.equal(download.status, 200);

  return new Uint8Array(await download.arrayBuffer());
}

export async function exportedZip(instance: Instance): Promise<Uint8Array> {
  const { id } = await readyExport(instance);

  return downloadedZip(instance, id);
}

export async function storedKeys(instance: Instance, prefix: string): Promise<readonly string[]> {
  const found: string[] = [];
  let cursor: string | null = null;

  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each page starts where the previous one ended.
    const page = await instance.core.files.list(prefix, cursor, 1000);

    found.push(...page.keys);
    cursor = page.cursor;
  } while (cursor !== null);

  return found;
}

export async function bytesOfKey(instance: Instance, key: string): Promise<Uint8Array> {
  const body = await instance.core.files.get(key);

  assert.ok(body !== null, `${key} is stored`);

  return new Uint8Array(await new Response(body).arrayBuffer());
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
  const keys = await storedKeys(instance, `exports/${String(id)}/`);

  const parts = keys
    .filter((key) => key.includes("/part-"))
    .toSorted((left, right) => Number(left.split("-")[1]) - Number(right.split("-")[1]));

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
