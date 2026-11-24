import assert from "node:assert/strict";

import type { Instance } from "./instance.ts";
import { exec } from "./sqlite-fixtures.ts";

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
