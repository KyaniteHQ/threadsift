import { utf8Length } from "../../../core/contract/encoding.ts";
import { INLINE_TEXT_BYTES } from "../../../core/contract/limits.ts";

export const PART_SEPARATOR = "\n\n";

export function partBytes(part: string): number {
  return utf8Length(`${PART_SEPARATOR}${part}`);
}

export function roomAfter(lead: string, note: string): number {
  return INLINE_TEXT_BYTES - utf8Length(lead) - partBytes(note);
}
