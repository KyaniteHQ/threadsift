import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  downloadedZip,
  firstLongText,
  readyExport,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { assertSameBytes, entriesOf, entryOf, rootOf } from "./zip-fixtures.ts";

const MIB = 1024 * 1024;

interface StagedImage {
  readonly key: string;
  readonly bytes: Uint8Array;
}

function imagesOf(itemId: number, job: number, count: number, size: number): StagedImage[] {
  return Array.from({ length: count }, (_, at) => ({
    key: `items/${String(itemId)}/img-${String(job)}-0-${String(at + 1)}.png`,
    bytes: new Uint8Array(size).fill(job + at),
  }));
}

describe("an Item refreshed between two slices of its own entries keeps every file of its new version in the zip", () => {
  let instance: Instance;
  let itemId: number;

  const stored = async (images: readonly StagedImage[]) => {
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
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    ({ id: itemId } = firstLongText(await savedLibrary(instance, { inlineText: 1, fileText: 1 })));
  });

  after(() => instance.close());

  it("writes the 5 new images after a slice wrote the note, the post text and the first old image", async (t) => {
    const old = imagesOf(itemId, 900, 3, 5 * MIB);
    const fresh = imagesOf(itemId, 901, 5, MIB);
    const files = instance.core.files;
    const get = files.get.bind(files);
    const refreshAfter = old[0]?.key;
    let refreshed = false;

    await stored(old);
    t.mock.method(files, "get", async (key: string) => {
      const body = await get(key);

      if (key === refreshAfter && !refreshed) {
        refreshed = true;
        await stored(fresh);
      }

      return body;
    });

    const { id } = await readyExport(instance);

    t.mock.restoreAll();

    const entries = await entriesOf(await downloadedZip(instance, id));
    const root = rootOf(entries);
    const written = fresh.filter(({ key }) => entries.has(`${root}${key}`)).map(({ key }) => key);

    assert.ok(refreshed, "a slice read the first old image");
    assert.deepEqual(
      written,
      fresh.map(({ key }) => key),
    );

    for (const { key, bytes } of fresh)
      assertSameBytes(entryOf(entries, `${root}${key}`), bytes, key);
  });
});
