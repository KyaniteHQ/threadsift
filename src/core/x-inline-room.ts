import { utf8Length } from "./encoding.ts";
import { INLINE_TEXT_BYTES } from "./limits.ts";

export const PART_SEPARATOR = "\n\n";

export function roomAfter(lead: string, note: string): number {
  return INLINE_TEXT_BYTES - utf8Length(lead) - utf8Length(`${PART_SEPARATOR}${note}`);
}
