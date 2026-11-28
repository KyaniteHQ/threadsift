import assert from "node:assert/strict";
import type { TestContext } from "node:test";

import {
  downloadedZip,
  firstLongText,
  readyExport,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { type Entries, entriesOf } from "./zip-fixtures.ts";

export const MIB = 1024 * 1024;

interface StagedImage {
  readonly key: string;
  readonly bytes: Uint8Array;
}

export interface StagedImages {
  readonly itemId: number;
  readonly images: readonly StagedImage[];
}

export function imagesOf(itemId: number, job: number, count: number, size: number): StagedImages {
  return {
    itemId,
    images: Array.from({ length: count }, (_, at) => ({
      key: `items/${String(itemId)}/img-${String(job)}-0-${String(at + 1)}.png`,
      bytes: new Uint8Array(size).fill(job + at),
    })),
  };
}

export async function storeImages(
  instance: Instance,
  { itemId, images }: Readonly<StagedImages>,
): Promise<void> {
  await Promise.all(images.map(({ key, bytes }) => instance.core.files.put(key, bytes)));
  instance.database.exec("delete from media where item_id = ?", itemId);

  for (const [at, { key, bytes }] of images.entries()) {
    instance.database.exec(
      "insert into media (item_id, kind, source_url, position, outcome, file_key, content_type, size) values (?, 'image', ?, ?, 'stored', ?, 'image/png', ?)",
      itemId,
      `https://example.com/${key}`,
      at,
      key,
      bytes.length,
    );
  }
}

export async function exportChangedOnRead(
  t: TestContext,
  instance: Instance,
  staged: Readonly<StagedImages>,
  change: () => Promise<void> | void,
): Promise<Entries> {
  const [first] = staged.images;

  assert.ok(first !== undefined, "the Item stores an image");
  await storeImages(instance, staged);

  const files = instance.core.files;
  const get = files.get.bind(files);
  let changed = false;

  t.mock.method(files, "get", async (name: string) => {
    const body = await get(name);

    if (name === first.key && !changed) {
      changed = true;
      await change();
    }

    return body;
  });

  const { id } = await readyExport(instance);

  t.mock.restoreAll();
  assert.ok(changed, `a slice read ${first.key}`);

  return entriesOf(await downloadedZip(instance, id));
}

export function notesOf(entries: Entries, itemId: number): readonly string[] {
  const note = new RegExp(`/items/${String(itemId)}/note-[^/]+\\.md$`, "u");

  return [...entries.keys()].filter((name) => note.test(name));
}

export async function instanceWithLongText(): Promise<{ instance: Instance; itemId: number }> {
  const instance = await Instance.start();

  await instance.setUp();

  const { id } = firstLongText(await savedLibrary(instance, { inlineText: 1, fileText: 1 }));

  return { instance, itemId: id };
}
