import assert from "node:assert/strict";

import { listedKeys } from "../src/core/kernel/file-pages.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";
import { directoryOf } from "./zip-fixtures.ts";

export const postTextKey = (id: number): string => `items/${String(id)}/post-1-1.md`;

export async function storedBytes(instance: Instance, key: string): Promise<Uint8Array | null> {
  const body = await instance.core.files.get(key);

  return body === null ? null : new Uint8Array(await new Response(body).arrayBuffer());
}

export async function bytesOfKey(instance: Instance, key: string): Promise<Uint8Array> {
  const bytes = await storedBytes(instance, key);

  assert.ok(bytes !== null, `${key} is stored`);

  return bytes;
}

export function itemTextAt(instance: Instance, id: number, key: string): void {
  exec(instance, "update items set post_text = null, post_text_key = ? where id = ?", key, id);
}

export const exportKeys = (instance: Instance, id: number): Promise<readonly string[]> =>
  listedKeys(instance.core.files, `exports/${String(id)}/`);

export async function numberedKeys(
  instance: Instance,
  id: number,
  stem: string,
): Promise<readonly string[]> {
  const keys = await exportKeys(instance, id);

  return keys
    .filter((key) => key.includes(`/${stem}-`))
    .toSorted((left, right) => Number(left.split("-")[1]) - Number(right.split("-")[1]));
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
  const parts = await numberedKeys(instance, id, "part");

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
