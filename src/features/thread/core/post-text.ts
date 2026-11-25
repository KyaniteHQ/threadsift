import { FileRefused, parseFileKey } from "../../../core/contract/file-keys.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import type { FileStore } from "../../../core/kernel/file-store.ts";

type PostTextRead =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "over" }
  | { readonly kind: "lost" };

function unavailable(itemId: number, key: string, reason: string): PostTextRead {
  report("post-text-unavailable", { itemId, reason, key });

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
