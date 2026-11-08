import { FileRefused, parseFileKey } from "./file-keys.ts";
import type { FileStore } from "./ports.ts";

const UNESCAPED_BY_JSON = /[\u007F-\u009F\u2028\u2029]/gu;

function escaped(character: string): string {
  return "\\u" + (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0");
}

function unavailable(itemId: number, key: string, reason: string): null {
  const line = JSON.stringify({ event: "post-text-unavailable", itemId, reason, key });

  console.warn(line.replaceAll(UNESCAPED_BY_JSON, escaped));

  return null;
}

async function textOf(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let text = "";

  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}

export async function readPostText(
  files: FileStore,
  itemId: number,
  key: string,
): Promise<string | null> {
  if (parseFileKey(key) === null) {
    return unavailable(itemId, key, "refused-key");
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

  return stream === null ? unavailable(itemId, key, "missing") : textOf(stream);
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
