import { utf8Length } from "./encoding.ts";
import { INLINE_TEXT_BYTES } from "./limits.ts";

const METADATA_BYTES = 4096;

class ThreadRefused extends Error {}

export type ThreadRefusal = { readonly kind: "refused"; readonly reason: string };

type Read<Value> = { readonly kind: "read"; readonly value: Value } | ThreadRefusal;

export function refuse(reason: string): never {
  throw new ThreadRefused(reason);
}

export function checkedText(text: string, what: string): void {
  if (utf8Length(text) > INLINE_TEXT_BYTES) {
    refuse(`${what} is longer than ${String(INLINE_TEXT_BYTES)} bytes`);
  }
}

export function checkedMetadata(fields: Readonly<Record<string, string>>): void {
  for (const [what, text] of Object.entries(fields)) {
    if (utf8Length(text) > METADATA_BYTES) {
      refuse(`${what} is longer than ${String(METADATA_BYTES)} bytes`);
    }
  }
}

export function refusing<Value>(read: () => Value): Read<Value> {
  try {
    return { kind: "read", value: read() };
  } catch (error) {
    if (error instanceof ThreadRefused) return { kind: "refused", reason: error.message };

    throw error;
  }
}
