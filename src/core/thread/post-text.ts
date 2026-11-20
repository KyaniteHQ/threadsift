import { FileRefused, parseFileKey } from "../contract/file-keys.ts";
import type { FileStore } from "../kernel/file-store.ts";

const UNESCAPED_BY_JSON = /[\u007F-\u009F\u2028\u2029]/gu;

function escaped(character: string): string {
  return "\\u" + (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0");
}

export type PostTextRead =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "over" }
  | { readonly kind: "lost" };

function unavailable(itemId: number, key: string, reason: string): PostTextRead {
  const line = JSON.stringify({ event: "post-text-unavailable", itemId, reason, key });

  console.warn(line.replaceAll(UNESCAPED_BY_JSON, escaped));

  return { kind: "lost" };
}

async function textOf(stream: ReadableStream<Uint8Array>, limit: number): Promise<PostTextRead> {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let text = "";
  let bytes = 0;

  for await (const chunk of stream) {
    bytes += chunk.length;

    if (bytes > limit) return { kind: "over" };

    text += decoder.decode(chunk, { stream: true });
  }

  return { kind: "text", text: text + decoder.decode() };
}

export async function readPostTextWithin(
  files: FileStore,
  itemId: number,
  key: string,
  limit: number,
): Promise<PostTextRead> {
  const parsed = parseFileKey(key);

  if (parsed === null) {
    return unavailable(itemId, key, "refused-key");
  }

  if (parsed.itemId !== String(itemId)) {
    return unavailable(itemId, key, "foreign-key");
  }

  let stream: ReadableStream<Uint8Array> | null;

  try {
    stream = await files.get(key);
  } catch (error) {
    if (error instanceof FileRefused) {
      return unavailable(itemId, key, "refused-file");
    }

    throw error;
  }

  if (stream === null) {
    return unavailable(itemId, key, "missing");
  }

  return textOf(stream, limit);
}

export async function readPostText(
  files: FileStore,
  itemId: number,
  key: string,
): Promise<string | null> {
  const read = await readPostTextWithin(files, itemId, key, Number.POSITIVE_INFINITY);

  return read.kind === "text" ? read.text : null;
}

export function postTextOf(
  files: FileStore,
  itemId: number,
  { postText, postTextKey }: Readonly<{ postText: string | null; postTextKey: string | null }>,
): Promise<string | null> {
  return postTextKey === null
    ? Promise.resolve(postText)
    : readPostText(files, itemId, postTextKey);
}
