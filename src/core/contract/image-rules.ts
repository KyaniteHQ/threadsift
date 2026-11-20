import { utf8Length } from "./encoding.ts";

export const ITEM_IMAGES_MAX = 20;

const IMAGE_URL_MAX_BYTES = 4096;

export function fits(url: string): boolean {
  return utf8Length(url) <= IMAGE_URL_MAX_BYTES;
}
