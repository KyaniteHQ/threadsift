import { z } from "zod";

const PLAIN_TEXT = /^[^[\]{}"\r\n]+$/u;

export function plainText(max: number) {
  return z.string().trim().min(1).max(max).regex(PLAIN_TEXT);
}
